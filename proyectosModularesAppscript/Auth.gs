/******************************************************
 * Auth.gs
 * Registro de usuarios, inicio/cierre de sesión,
 * validación de tokens, hasheo seguro
 ******************************************************/

// =====================================================
// HASHING Y TOKENS
// =====================================================

function generarSalt_() {
  return Utilities.getUuid();
}

/**
 * Hash SHA-256 con salt. En GAS no hay bcrypt nativo,
 * así que usamos SHA-256 + salt único como mejor opción disponible.
 */
function hashPassword_(password, salt) {
  // Doble hash para mayor resistencia: H(salt + H(password + salt))
  const primeraPassada = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt
  );
  const hexPrimera = primeraPassada
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('');

  const segundaPassada = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + hexPrimera
  );
  return segundaPassada
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Genera un token de sesión criptográficamente único.
 */
function generarToken_() {
  // Combinar UUID + timestamp para mayor entropía
  const base = Utilities.getUuid() + '-' + Date.now();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

// =====================================================
// REGISTRO DE CUENTA
// =====================================================

/**
 * Registra un nuevo usuario. Validaciones estrictas de dominio y contraseña.
 * @param {Object} data - { email, password, confirmPassword }
 * @return {Object} { success, message, rol }
 */

// =====================================================
// REGISTRO DE CUENTA CON VERIFICACIÓN (OTP)
// =====================================================

/**
 * Paso 1: Valida datos, genera código OTP y lo envía al correo.
 */
function solicitarRegistro(data) {
  try {
    const emailRaw = sanitize_(data.email || '');
    const password = data.password || '';
    const confirmPassword = data.confirmPassword || '';

    // Validaciones de email y dominio
    const validacionEmail = validarEmail_(emailRaw);
    if (!validacionEmail.valido) return { success: false, message: validacionEmail.error };
    const email = validacionEmail.email;
    const rol = validacionEmail.rol;

    // Validaciones de contraseña
    if (!password || password.length < 8) return { success: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
    if (password !== confirmPassword) return { success: false, message: 'Las contraseñas no coinciden.' };

    // Verificar si el correo ya existe
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = usuariosSheet_();
      const datos = sheet.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        if (String(datos[i][0]).toLowerCase().trim() === email) {
          return { success: false, message: 'Ya existe una cuenta con ese correo.' };
        }
      }
    } finally {
      lock.releaseLock();
    }

    // Generar código OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const regToken = Utilities.getUuid();

    // Guardar temporalmente en Caché por 10 minutos (600 segundos)
    const cache = CacheService.getScriptCache();
    cache.put(regToken, JSON.stringify({ email: email, password: password, rol: rol, otp: otp }), 600);

    // Enviar código por correo
    const htmlBody = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #0b3d91;">Verificación de Cuenta</h2>
        <p>Hola,</p>
        <p>Tu código de verificación para la plataforma ModuHub CUCEI es:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; color: #10b981;">${otp}</h1>
        <p>Este código <strong>expirará en 10 minutos</strong>.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin-top: 20px;">
        <p style="font-size: 12px; color: #666;">Si no solicitaste este registro, ignora este correo.</p>
      </div>`;

    MailApp.sendEmail({
      to: email,
      subject: 'Código de Verificación - ModuHub CUCEI',
      htmlBody: htmlBody
    });

    return { success: true, message: 'Te hemos enviado un código de 6 dígitos al correo.', regToken: regToken };
  } catch (err) {
    console.error('Error en solicitarRegistro: ' + err.message);
    return { success: false, message: 'Error al enviar código. Intenta de nuevo.' };
  }
}

/**
 * Paso 2: Valida el código OTP y crea finalmente el usuario.
 */
function verificarRegistro(regToken, otpDigitado) {
  try {
    if(!regToken || !otpDigitado) return { success: false, message: 'Datos incompletos.' };

    const cache = CacheService.getScriptCache();
    const cachedData = cache.get(regToken);

    if(!cachedData) return { success: false, message: 'El código ha expirado. Vuelve a registrarte.' };

    const data = JSON.parse(cachedData);
    if(String(data.otp) !== String(otpDigitado).trim()) {
      return { success: false, message: 'Código incorrecto.' };
    }

    // Código correcto: Escribir en la base de datos
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = usuariosSheet_();
      const datos = sheet.getDataRange().getValues();
      for (let i = 1; i < datos.length; i++) {
        if (String(datos[i][0]).toLowerCase().trim() === data.email) {
          return { success: false, message: 'La cuenta ya fue registrada.' };
        }
      }

      const salt = generarSalt_();
      const hash = hashPassword_(data.password, salt);
      sheet.appendRow([data.email, hash, salt, data.rol, new Date()]);

      // Limpiar caché
      cache.remove(regToken);

      return { success: true, message: 'Cuenta creada con éxito.' };
    } finally {
      lock.releaseLock();
    }
  } catch(err) {
    console.error('Error en verificarRegistro: ' + err.message);
    return { success: false, message: 'Error de verificación.' };
  }
}

// =====================================================
// INICIO DE SESIÓN
// =====================================================

/**
 * Autentica un usuario y devuelve un token de sesión.
 * @param {string} email
 * @param {string} password
 * @return {Object} { success, token, email, rol, message }
 */
function iniciarSesion(email, password) {
  try {
    const validacionEmail = validarEmail_(email || '');
    if (!validacionEmail.valido) {
      // No revelar si el email es inválido vs. no existe
      return { success: false, message: 'Credenciales incorrectas.' };
    }
    const emailLimpio = validacionEmail.email;

    if (!password) {
      return { success: false, message: 'Credenciales incorrectas.' };
    }

    const sheet = usuariosSheet_();
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).toLowerCase().trim() === emailLimpio) {
        const hashGuardado = String(datos[i][1]);
        const salt = String(datos[i][2]);
        const rol = String(datos[i][3]);
        const hashIntento = hashPassword_(password, salt);

        if (hashIntento === hashGuardado) {
          const token = generarToken_();
          const cache = CacheService.getScriptCache();
          const sessionData = JSON.stringify({
            email: emailLimpio,
            rol: rol,
            creado: Date.now()
          });
          cache.put(token, sessionData, SESSION_DURATION);

          return {
            success: true,
            token: token,
            email: emailLimpio,
            rol: rol
          };
        } else {
          // Mismo mensaje genérico para no revelar si el email existe
          return { success: false, message: 'Credenciales incorrectas.' };
        }
      }
    }

    // Email no encontrado — mismo mensaje genérico
    return { success: false, message: 'Credenciales incorrectas.' };
  } catch (err) {
    console.error('Error en iniciarSesion: ' + err.message);
    return { success: false, message: 'Error interno al iniciar sesión.' };
  }
}

// =====================================================
// VALIDACIÓN Y CIERRE DE SESIÓN
// =====================================================

/**
 * Valida un token activo. Retorna { email, rol } o null.
 */
function validarSesion(token) {
  if (!token || typeof token !== 'string' || token.length < 10) return null;
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(token);
    if (!raw) return null;
    const sesion = JSON.parse(raw);

    // Verificar que la sesión tiene los campos esperados
    if (!sesion.email || !sesion.rol) return null;

    return { email: sesion.email, rol: sesion.rol };
  } catch (e) {
    return null;
  }
}

/**
 * Cierra sesión eliminando el token del cache.
 */
function cerrarSesion(token) {
  try {
    if (token) {
      const cache = CacheService.getScriptCache();
      cache.remove(token);
    }
    return { success: true };
  } catch (e) {
    return { success: true }; // Cerrar sesión siempre "éxito" para el usuario
  }
}

// =====================================================
// HELPERS DE AUTORIZACIÓN
// =====================================================

/**
 * Valida sesión y verifica que el usuario tenga uno de los roles permitidos.
 * Retorna { autorizado, sesion, error }
 */
function autorizarRoles_(token, rolesPermitidos) {
  const sesion = validarSesion(token);
  if (!sesion) {
    return {
      autorizado: false,
      sesion: null,
      error: 'Tu sesión expiró. Vuelve a iniciar sesión.'
    };
  }
  if (rolesPermitidos.indexOf(sesion.rol) === -1) {
    return {
      autorizado: false,
      sesion: sesion,
      error: 'No tienes permiso para realizar esta acción. Rol requerido: ' + rolesPermitidos.join(' o ')
    };
  }
  return { autorizado: true, sesion: sesion, error: '' };
}
