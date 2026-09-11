/******************************************************
 * Utils.gs
 * Funciones utilitarias: hojas, sanitización,
 * validación, folio, columnas, seguridad XSS
 ******************************************************/

// =====================================================
// SANITIZACIÓN XSS
// =====================================================

/**
 * Elimina etiquetas HTML/script y caracteres peligrosos.
 * Se aplica a TODA entrada de texto antes de escribir en la hoja.
 */
function sanitize_(input) {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // Eliminar etiquetas HTML
  s = s.replace(/<[^>]*>/g, '');

  // Escapar caracteres especiales de HTML
  s = s.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#39;');

  // Eliminar caracteres de control excepto newline y tab
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return s.trim();
}

/**
 * Sanitiza un objeto completo (todos los valores string).
 */
function sanitizeObject_(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const limpio = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      limpio[key] = sanitize_(obj[key]);
    } else {
      limpio[key] = obj[key];
    }
  }
  return limpio;
}

// =====================================================
// VALIDACIÓN DE EMAIL
// =====================================================

/**
 * Valida formato de email y que pertenezca a dominio autorizado.
 * Retorna { valido: bool, email: string, dominio: string, rol: string, error: string }
 */
function validarEmail_(email) {
  const resultado = { valido: false, email: '', dominio: '', rol: '', error: '' };

  if (!email || typeof email !== 'string') {
    resultado.error = 'El correo es obligatorio.';
    return resultado;
  }

  const limpio = email.toLowerCase().trim();

  // Regex estricta para email institucional
  const regexEmail = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@([a-z0-9.-]+\.[a-z]{2,})$/;
  const match = limpio.match(regexEmail);

  if (!match) {
    resultado.error = 'Formato de correo electrónico no válido.';
    return resultado;
  }

  const dominio = match[1];
  const rol = DOMINIOS_ROL[dominio];

  if (!rol) {
    resultado.error = 'Solo se permiten correos @alumnos.udg.mx, @cucei.udg.mx o @academicos.udg.mx';
    return resultado;
  }

  resultado.valido = true;
  resultado.email = limpio;
  resultado.dominio = dominio;
  resultado.rol = rol;
  return resultado;
}

// =====================================================
// HOJA DE CÁLCULO
// =====================================================

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function usuariosSheet_() {
  return getOrCreateSheet_(SHEET_USUARIOS, [
    'Email', 'PasswordHash', 'Salt', 'Rol', 'FechaRegistro'
  ]);
}

function seccion1Sheet_() {
  const sheet = getOrCreateSheet_(SHEET_SECCION1, ENCABEZADOS_SECCION1);
  asegurarEncabezados_(sheet, ENCABEZADOS_SECCION1);
  return sheet;
}

function configSheet_() {
  return getOrCreateSheet_(SHEET_CONFIG, ['Clave', 'Valor']);
}

/**
 * Agrega columnas faltantes al final sin alterar datos existentes.
 */
function asegurarEncabezados_(sheet, encabezadosEsperados) {
  const ultimaCol = sheet.getLastColumn();
  const actuales = ultimaCol > 0
    ? sheet.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String)
    : [];
  const faltantes = encabezadosEsperados.filter(h => actuales.indexOf(h) === -1);
  if (faltantes.length > 0) {
    sheet.getRange(1, actuales.length + 1, 1, faltantes.length)
         .setValues([faltantes]);
  }
}

/**
 * Retorna mapa { nombreColumna: indice0based } de una hoja.
 */
function mapaColumnas_(sheet) {
  const ultimaCol = sheet.getLastColumn();
  if (ultimaCol === 0) return {};
  const encabezados = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];
  const indice = {};
  encabezados.forEach((nombre, i) => { indice[String(nombre)] = i; });
  return indice;
}

// =====================================================
// FOLIO
// =====================================================

/**
 * Genera folio secuencial con LockService para evitar colisiones.
 * Formato: MOD-ICOM-2026B-0001
 */
function generarFolio_(tipoMalla) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();
    const prefijo = 'MOD-' + tipoMalla + '-' + CICLO_ESCOLAR + '-';
    let maxNum = 0;

    for (let i = 1; i < datos.length; i++) {
      const folioExistente = String(datos[i][col['Folio']] || '');
      if (folioExistente.startsWith(prefijo)) {
        const num = parseInt(folioExistente.substring(prefijo.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return prefijo + String(maxNum + 1).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// CONFIGURACIÓN DINÁMICA
// =====================================================

/**
 * Lee un valor de la hoja Config por clave.
 */
function obtenerConfig_(clave) {
  const sheet = configSheet_();
  const datos = sheet.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === clave) {
      return String(datos[i][1]).trim();
    }
  }
  return null;
}

/**
 * Verifica si el registro está abierto según la hoja Config.
 */
function registroAbierto_() {
  const valor = obtenerConfig_('registrationOpen');
  return valor && valor.toUpperCase() === 'TRUE';
}

/**
 * Verifica si la fecha actual está dentro del deadline.
 */
function dentroDeDeadline_() {
  const deadlineStr = obtenerConfig_('deadline');
  if (!deadlineStr) return true; // Sin deadline = siempre abierto
  try {
    const deadline = new Date(deadlineStr + 'T23:59:59');
    return new Date() <= deadline;
  } catch (e) {
    return true;
  }
}

// =====================================================
// VALIDACIÓN DE ARCHIVOS
// =====================================================

/**
 * Valida tipo de archivo por extensión, MIME type y magic bytes.
 * Retorna { valido: bool, extension: string, error: string }
 */
function validarArchivo_(archivoBase64, nombreArchivo, mimeType) {
  const resultado = { valido: false, extension: '', error: '' };

  // 1. Validar extensión
  const partes = nombreArchivo.split('.');
  if (partes.length < 2) {
    resultado.error = 'El archivo debe tener una extensión válida (.pdf o .docx).';
    return resultado;
  }
  const extension = partes.pop().toLowerCase();
  if (EXTENSIONES_PERMITIDAS.indexOf(extension) === -1) {
    resultado.error = 'Solo se permiten archivos PDF (.pdf) o Word (.docx). Extensión recibida: .' + extension;
    return resultado;
  }

  // 2. Validar MIME type declarado
  if (!MIME_TYPES_PERMITIDOS[mimeType]) {
    resultado.error = 'Tipo de archivo no permitido (MIME: ' + sanitize_(mimeType) + '). Solo PDF o Word (.docx).';
    return resultado;
  }

  // 3. Coherencia extensión ↔ MIME
  if (MIME_TYPES_PERMITIDOS[mimeType] !== extension) {
    resultado.error = 'La extensión del archivo no coincide con su tipo MIME. Posible archivo manipulado.';
    return resultado;
  }

  // 4. Validar tamaño
  const tamanoBytes = Math.ceil(archivoBase64.length * 3 / 4);
  if (tamanoBytes > TAMANO_MAX_MB_SECCION2 * 1024 * 1024) {
    resultado.error = 'El archivo excede el tamaño máximo de ' + TAMANO_MAX_MB_SECCION2 + ' MB.';
    return resultado;
  }
  if (tamanoBytes < 1024) {
    resultado.error = 'El archivo parece estar vacío o es demasiado pequeño (< 1 KB).';
    return resultado;
  }

  // 5. Validar magic bytes (firma del archivo)
  try {
    const bytes = Utilities.base64Decode(archivoBase64.substring(0, 20));
    const esperados = MAGIC_BYTES[extension];
    if (esperados) {
      for (let i = 0; i < esperados.length; i++) {
        const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
        if (b !== esperados[i]) {
          resultado.error = 'El contenido real del archivo no corresponde a un ' + extension.toUpperCase() + ' válido. Posible archivo renombrado.';
          return resultado;
        }
      }
    }
  } catch (e) {
    resultado.error = 'No se pudo verificar la integridad del archivo.';
    return resultado;
  }

  resultado.valido = true;
  resultado.extension = extension;
  return resultado;
}

/**
 * Extrae metadatos de un archivo ya subido a Drive para auditoría.
 * Retorna objeto con autor, fecha creación, última modificación.
 */
function extraerMetadatos_(archivoId) {
  try {
    const archivo = DriveApp.getFileById(archivoId);
    const creado = archivo.getDateCreated();
    const modificado = archivo.getLastUpdated();

    // Intentar obtener info adicional via Advanced Drive API (si está habilitado)
    let autor = 'No disponible';
    try {
      // El propietario del archivo en Drive es quien lo subió (el script)
      // pero podemos registrar el nombre del owner
      const owners = archivo.getOwner();
      if (owners) autor = owners.getEmail();
    } catch (e) { /* sin acceso al owner */ }

    return {
      autor: autor,
      fechaCreacion: creado
        ? Utilities.formatDate(creado, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : '',
      ultimaModificacion: modificado
        ? Utilities.formatDate(modificado, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : ''
    };
  } catch (e) {
    return { autor: 'Error', fechaCreacion: '', ultimaModificacion: '' };
  }
}

// =====================================================
// VALIDACIÓN DE URL YOUTUBE
// =====================================================

function validarURLYoutube_(url) {
  if (!url || typeof url !== 'string') return false;
  const limpio = url.trim();
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+/i.test(limpio);
}

// =====================================================
// CORREO DE CONFIRMACIÓN
// =====================================================

/******************************************************
 * Utils.gs - Actualización de Correos Institucionales
 ******************************************************/

// (Mantén el resto de tus funciones en Utils.gs y solo sustituye las de correo)

function enviarCorreoConfirmacion_(emailDestino, folio, formData) {
  try {
    const asunto = 'Confirmación Oficial de Registro · Proyecto Modular [' + folio + ']';
    const cuerpoHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #333333; }
          .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding: 40px 0; }
          .main-card { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e1e8ed; }
          .header-banner { background: linear-gradient(135deg, #0b3d91 0%, #1a56c4 100%); padding: 30px; text-align: center; color: #ffffff; }
          .header-logo { width: 64px; height: 64px; background: #ffffff; border-radius: 50%; padding: 6px; margin-bottom: 12px; display: inline-block; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header-banner h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.5px; }
          .header-banner p { margin: 6px 0 0; font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
          .content-body { padding: 30px; }
          .welcome-text { font-size: 16px; font-weight: 600; color: #0b3d91; margin-bottom: 15px; }
          .description { font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 25px; }
          .info-box { background-color: #f8fafc; border-left: 4px solid #06b6d4; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 25px; }
          .info-row { font-size: 13px; margin-bottom: 10px; display: block; }
          .info-row strong { color: #1e293b; width: 140px; display: inline-block; }
          .badge-folio { background-color: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-weight: bold; font-size: 15px; display: inline-block; }
          .image-grid { display: block; text-align: center; margin: 25px 0; }
          .image-grid img { width: 100%; max-height: 180px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; }
          .footer { background-color: #0f172a; color: #94a3b8; text-align: center; padding: 20px; font-size: 11px; line-height: 1.5; }
          .footer strong { color: #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <table class="main-card" cellpadding="0" cellspacing="0">
            <tr>
              <td class="header-banner">
                <!-- Logotipo institucional oficial optimizado -->
                <img class="header-logo" src="https://www.cucei.udg.mx/sites/default/files/styles/cucei_logo/public/escudo_udg_cucei_nuevo.png" alt="Logo CUCEI UDG">
                <h1>UNIVERSIDAD DE GUADALAJARA</h1>
                <p>Centro Universitario de Ciencias Exactas e Ingenierías</p>
              </td>
            </tr>
            <tr>
              <td class="content-body">
                <div class="welcome-text">Estimado(a) ${sanitize_(formData.nombreLider)}, su registro ha sido exitoso.</div>
                <div class="description">
                  Por medio del presente se le notifica que los datos generales y la propuesta técnica de su <strong>Proyecto Modular (${sanitize_(formData.tipoMalla)})</strong> han quedado ingresados formalmente en el sistema institucional para el ciclo <strong>${sanitize_(CICLO_ESCOLAR)}</strong>.
                </div>

                <div class="info-box">
                  <div style="margin-bottom: 12px;">
                    <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Folio Único Asignado</span>
                    <span class="badge-folio">${sanitize_(folio)}</span>
                  </div>
                  <span class="info-row"><strong>Proyecto:</strong> ${sanitize_(formData.tituloProyecto)}</span>
                  <span class="info-row"><strong>Líder:</strong> ${sanitize_(formData.nombreLider)} (${sanitize_(formData.codigoLider)})</span>
                  <span class="info-row"><strong>Asesor Principal:</strong> ${sanitize_(formData.asesor1)}</span>
                </div>

                <div class="image-grid">
                  <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80" alt="Instalaciones CUCEI">
                </div>

                <div class="description" style="font-size: 13px; color: #64748b; margin-top: 15px;">
                  <strong>Importante:</strong> Guarde este comprobante con su folio. Deberá ingresar periódicamente a la plataforma ModuHub para completar la subida de sus entregables (Documento final y video demostrativo) y consultar las observaciones de su asesor.
                </div>
              </td>
            </tr>
            <tr>
              <td class="footer">
                Coordinación de Ingeniería en Computación e Ingeniería Informática (ICOM / INCO)<br>
                <strong>CUCEI · Universidad de Guadalajara</strong><br>
                Este correo es informativo y se genera de manera automática por el sistema académico.
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: emailDestino,
      subject: asunto,
      htmlBody: cuerpoHtml
    });
  } catch (err) {
    console.error('Error enviando correo confirmación: ' + err.message);
  }
}

function enviarCorreoEvaluacion_(emailDestino, folio, estado, observaciones, obsDoc, obsVideo) {
  try {
    const esAprobado = estado === ESTADOS_PROYECTO.APROBADO;
    const colorEstado = esAprobado ? '#10b981' : '#f59e0b';
    const tituloEstado = esAprobado ? 'PROYECTO APROBADO' : 'REQUIERE CORRECCIONES (NO APROBADO)';
    const iconoEstado = esAprobado ? '✔' : '⚠';

    const asunto = `Dictamen Académico · Proyecto Modular [${folio}] - ${estado}`;
    const cuerpoHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #333333; }
          .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding: 40px 0; }
          .main-card { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e1e8ed; }
          .header-banner { background: linear-gradient(135deg, #0b3d91 0%, #1a56c4 100%); padding: 30px; text-align: center; color: #ffffff; }
          .header-logo { width: 64px; height: 64px; background: #ffffff; border-radius: 50%; padding: 6px; margin-bottom: 12px; display: inline-block; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header-banner h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: 0.5px; }
          .header-banner p { margin: 6px 0 0; font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
          .content-body { padding: 30px; }
          .welcome-text { font-size: 16px; font-weight: 600; color: #0b3d91; margin-bottom: 15px; }
          .description { font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 25px; }
          .status-box { background-color: #f8fafc; border-left: 4px solid ${colorEstado}; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 25px; }
          .status-title { font-size: 14px; font-weight: bold; color: ${colorEstado}; margin-bottom: 8px; text-transform: uppercase; }
          .info-row { font-size: 13px; margin-bottom: 8px; display: block; }
          .info-row strong { color: #1e293b; width: 140px; display: inline-block; }
          .badge-folio { background-color: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-weight: bold; font-size: 14px; display: inline-block; }
          .feedback-card { background-color: #fffbeb; border: 1px solid #fef3c7; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 13px; color: #92400e; }
          .footer { background-color: #0f172a; color: #94a3b8; text-align: center; padding: 20px; font-size: 11px; line-height: 1.5; }
          .footer strong { color: #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <table class="main-card" cellpadding="0" cellspacing="0">
            <tr>
              <td class="header-banner">
                <img class="header-logo" src="https://www.cucei.udg.mx/sites/default/files/styles/cucei_logo/public/escudo_udg_cucei_nuevo.png" alt="Logo CUCEI UDG">
                <h1>UNIVERSIDAD DE GUADALAJARA</h1>
                <p>Centro Universitario de Ciencias Exactas e Ingenierías</p>
              </td>
            </tr>
            <tr>
              <td class="content-body">
                <div class="welcome-text">Resultado de Evaluación Académica</div>
                <div class="description">
                  Se ha emitido la revisión y dictamen oficial por parte de su profesor asesor respecto a los entregables correspondientes a su Proyecto Modular.
                </div>

                <div class="status-box">
                  <div class="status-title">${iconoEstado} ${tituloEstado}</div>
                  <span class="info-row"><strong>Folio:</strong> <span class="badge-folio">${sanitize_(folio)}</span></span>
                  <span class="info-row"><strong>Dictamen:</strong> ${sanitize_(estado)}</span>
                </div>

                <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-bottom: 5px;">Detalle de Retroalimentación:</div>
                <div style="font-size: 13px; color: #475569; line-height: 1.5; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 8px 0;"><strong>Comentarios generales:</strong> ${sanitize_(observaciones || 'Sin observaciones')}</p>
                  <p style="margin: 0 0 8px 0;"><strong>Sobre el documento (PDF):</strong> ${sanitize_(obsDoc || 'Sin comentarios')}</p>
                  <p style="margin: 0;"><strong>Sobre el video demo:</strong> ${sanitize_(obsVideo || 'Sin comentarios')}</p>
                </div>

                ${!esAprobado ? `
                  <div class="feedback-card">
                    <strong>Acción Requerida:</strong> Su formulario ha sido habilitado nuevamente en la plataforma ModuHub para que el líder del equipo pueda corregir los entregables señalados y realizar un nuevo envío.
                  </div>
                ` : `
                  <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 13px; color: #065f46;">
                    <strong>¡Felicitaciones!</strong> Su proyecto ha superado satisfactoriamente los filtros de evaluación académica de este ciclo.
                  </div>
                `}
              </td>
            </tr>
            <tr>
              <td class="footer">
                Coordinación de Ingeniería en Computación e Ingeniería Informática (ICOM / INCO)<br>
                <strong>CUCEI · Universidad de Guadalajara</strong><br>
                Este correo es informativo y se genera de manera automática por el sistema académico.
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: emailDestino,
      subject: asunto,
      htmlBody: cuerpoHtml
    });
  } catch (err) {
    console.error('Error enviando correo evaluación: ' + err.message);
  }
}
