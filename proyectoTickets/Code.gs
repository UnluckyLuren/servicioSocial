
/**
 * ============================================================
 * SISTEMA DE TICKETS DE SOPORTE ACADÉMICO
 * Backend Principal - Code.gs
 * Versión: 2.0 | Apps Script + Google Sheets
 * ============================================================
 * ARQUITECTURA:
 * - doGet()  → Sirve la SPA al cliente
 * - doPost() → Router central de API (recibe JSON)
 * - Cada acción está en su propia función privada
 * - CacheService maneja sesiones de staff (2h TTL)
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// CONSTANTES DE CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

// Modificar ID o folio de ticket, poner un buscador para buscar por nombre, codigo o correo del alumno para ver su historial de tickets esto solo para el coordinador y el asistente, quitar el boton de marcar como urgente en el formulario del alumno, quitar el campo de asunto y reemplazarlo por lo de categorias que ya esta (categoria ahora se va a llamar asunto).

const CONFIG = {
  // REEMPLAZA CON EL ID DE TU GOOGLE SHEET
  SPREADSHEET_ID: '1HF08atSOhTNURYVBMJVKtMwYPK57AnpFoHHNTw26zlA',

  // Nombres exactos de las hojas
  SHEETS: {
    TICKETS:  'Tickets',
    USUARIOS: 'Usuarios',
    LOGS:     'Logs_Inmutables'
  },

  // Dominio permitido para alumnos
  DOMINIO_ALUMNOS: '@alumnos.udg.mx',

  // Duración de sesión staff en segundos (2 horas)
  SESSION_TTL: 7200,

  // Prefijo para keys de caché de sesión
  CACHE_PREFIX: 'session_',

  // Estados válidos de ticket
  ESTADOS: {
    NUEVO:     'Nuevo',
    EN_PROCESO: 'En Proceso',
    RESUELTO:  'Resuelto',
    CERRADO:   'Cerrado'
  },

  // Prioridades válidas (solo asistente/coordinador pueden asignar)
  PRIORIDADES: {
    SIN_ASIGNAR: 'Sin Asignar',
    CRITICO:     'Critico',
    MEDIO:       'Medio',
    BAJO:        'Bajo'
  }
};

// ─────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA - doGet (Sirve la Web App)
// ─────────────────────────────────────────────────────────────

/**
 * Sirve la aplicación SPA al navegador.
 * Toda la lógica de rutas/vistas se maneja en el cliente.
 */

// ─────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA - Sirve la Web App
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle('Soporte Académico UDG')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch (error) {
    Logger.log('ERROR en doGet: ' + error.toString());
    return HtmlService.createHtmlOutput('Error al cargar la aplicación. Revisa los logs.');
  }
}

// Permite importar los archivos CSS y JS dentro del HTML
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL - API Gateway
// ─────────────────────────────────────────────────────────────
function procesarAccion(action, payload) {
  try {
    switch (action) {
      case 'login_staff': return loginStaff(payload);

      // Estas 3 acciones NO llevan "accionProtegida" porque son públicas
      case 'crear_ticket_alumno': return crearTicketAlumno(payload);
      case 'crear_ticket_profesor': return crearTicketProfesor(payload);
      case 'obtener_mis_tickets': return obtenerMisTickets(payload);

      // Estas acciones sí son para el staff
      case 'obtener_todos_tickets': return accionProtegida(payload, obtenerTodosTickets);
      case 'actualizar_prioridad': return accionProtegida(payload, actualizarPrioridad);
      case 'responder_ticket': return accionProtegida(payload, responderTicket);
      case 'logout_staff': return logoutStaff(payload);

      default: return { success: false, data: null, error: 'Acción no válida' };
    }
  } catch (error) {
    Logger.log(`[ROUTER ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error interno del servidor.' };
  }
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN HELPER: Include para archivos HTML separados
// ─────────────────────────────────────────────────────────────

/**
 * Incluye contenido de archivos .html dentro de Index.html
 * Permite separar CSS y JS en archivos independientes.
 * @param {string} filename - Nombre del archivo sin extensión
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL - doPost (API Gateway)
// ─────────────────────────────────────────────────────────────

function obtenerCorreoUsuario() {
  return Session.getActiveUser().getEmail();
}

function loginAutoCoordinador(payload) {
  const correo = String(payload.correo || '').toLowerCase().trim();
  if(!correo.includes('@coordinacion')) return { success: false, error: 'Acceso Denegado' };

  const sessionToken = generarToken();
  const sesionData = {
    token: sessionToken,
    codigo: 'COORD', // Código de bypass del auto-login
    nombre: correo.split('@')[0],
    rol: 'Coordinador',
    loginAt: new Date().toISOString()
  };

  CacheService.getScriptCache().put(CONFIG.CACHE_PREFIX + sessionToken, JSON.stringify(sesionData), CONFIG.SESSION_TTL);

  return { success: true, data: { sessionToken, nombre: sesionData.nombre, rol: sesionData.rol, codigo: sesionData.codigo }};
}

/**
 * Punto de entrada para todas las llamadas API desde el cliente.
 * Recibe JSON con { action: string, payload: object }
 * Retorna JSON con { success: bool, data: any, error: string }
 */
function doPost(e) {
  let response = { success: false, data: null, error: 'Acción no reconocida' };

  try {
    // Parsear el body JSON entrante
    const requestBody = JSON.parse(e.postData.contents);
    const { action, payload } = requestBody;

    Logger.log(`[ROUTER] Acción recibida: ${action}`);

    // ── Router de acciones públicas (sin sesión requerida) ──
    switch (action) {

      // Autenticación
      case 'login_staff':
        response = loginStaff(payload);
        break;

      // Creación de tickets (alumnos y profesores)
      case 'crear_ticket_alumno':
        response = crearTicketAlumno(payload);
        break;

      case 'crear_ticket_profesor':
        response = crearTicketProfesor(payload);
        break;

      // Ver historial propio (alumno/profesor valida su correo)
      case 'obtener_mis_tickets':
        response = obtenerMisTickets(payload);
        break;

      // ── Acciones protegidas (requieren sesión de staff) ──
      case 'obtener_todos_tickets':
        response = accionProtegida(payload, obtenerTodosTickets);
        break;

      case 'actualizar_prioridad':
        response = accionProtegida(payload, actualizarPrioridad);
        break;

      case 'responder_ticket':
        response = accionProtegida(payload, responderTicket);
        break;

      case 'logout_staff':
        response = logoutStaff(payload);
        break;

      case 'login_auto_coordinador':
        return loginAutoCoordinador(payload);

      default:
        response = { success: false, data: null, error: 'Acción no válida' };
        Logger.log(`[ROUTER] Acción desconocida: ${action}`);
    }

  } catch (error) {
    Logger.log(`[ROUTER ERROR] ${error.toString()}`);
    response = {
      success: false,
      data: null,
      error: 'Error interno del servidor. Intenta de nuevo.'
    };
  }

  // Retornar respuesta JSON con headers apropiados
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE DE SESIÓN - Protege acciones de staff
// ─────────────────────────────────────────────────────────────

/**
 * Wrapper que valida la sesión antes de ejecutar acciones protegidas.
 * @param {object} payload - Datos de la petición (debe incluir sessionToken)
 * @param {Function} fn - Función a ejecutar si la sesión es válida
 * @returns {object} Respuesta de la función o error de sesión
 */
function accionProtegida(payload, fn) {
  const validacion = validarSesion(payload.sessionToken);

  if (!validacion.valid) {
    registrarLog('SISTEMA', 'Sistema', 'ACCESO_DENEGADO_SIN_SESION', '',
      `Intento de acceso a acción protegida sin sesión válida`);
    return {
      success: false,
      data: null,
      error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.',
      requiresLogin: true
    };
  }

  // Inyectar datos del usuario en el payload para que la función los use
  payload._sesion = validacion.sesionData;
  return fn(payload);
}

// ─────────────────────────────────────────────────────────────
// MÓDULO DE AUTENTICACIÓN STAFF
// ─────────────────────────────────────────────────────────────

/**
 * Autentica a un Asistente o Coordinador.
 * Valida código + contraseña contra la hoja Usuarios.
 * Si es correcto, genera un token de sesión y lo guarda en CacheService.
 *
 * @param {object} payload - { codigo: string, password: string }
 * @returns {object} { success, data: { token, rol, nombre }, error }
 */
function loginStaff(payload) {
  try {
    // Sanitizar inputs
    const codigo   = sanitizarTexto(payload.codigo   || '');
    const password = sanitizarTexto(payload.password || '');

    if (!codigo || !password) {
      return { success: false, data: null, error: 'Código y contraseña son requeridos.' };
    }

    // Obtener hoja de usuarios
    const hoja = obtenerHoja(CONFIG.SHEETS.USUARIOS);
    const datos = hoja.getDataRange().getValues();

    // Hashear la contraseña ingresada para comparar
    const passwordHashIngresado = hashSHA256(password);

    // Buscar usuario (fila 0 es cabecera, empezar desde 1)
    // Columnas: ID(0), Nombre(1), Codigo(2), Password_Hash(3), Rol(4), Activo(5)
    let usuarioEncontrado = null;

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const codigoHoja    = String(fila[2]).trim();
      const hashHoja      = String(fila[3]).trim();
      const activo        = String(fila[5]).trim().toLowerCase();

      if (codigoHoja === codigo && hashHoja === passwordHashIngresado && activo === 'true') {
        usuarioEncontrado = {
          id:     fila[0],
          nombre: fila[1],
          codigo: fila[2],
          rol:    fila[4]
        };
        break;
      }
    }

    if (!usuarioEncontrado) {
      // Log de intento fallido (sin revelar si el usuario existe)
      registrarLog(codigo, 'Desconocido', 'LOGIN_FALLIDO', '',
        'Intento de login con credenciales inválidas');
      return { success: false, data: null, error: 'Credenciales incorrectas.' };
    }

    // Validar que el rol sea staff válido
    const rolesPermitidos = ['Asistente', 'Coordinador'];
    if (!rolesPermitidos.includes(usuarioEncontrado.rol)) {
      return { success: false, data: null, error: 'Rol no autorizado para este sistema.' };
    }

    // Generar token único de sesión
    const sessionToken = generarToken();
    const sesionData = {
      token:   sessionToken,
      codigo:  usuarioEncontrado.codigo,
      nombre:  usuarioEncontrado.nombre,
      rol:     usuarioEncontrado.rol,
      loginAt: new Date().toISOString()
    };

    // Guardar sesión en CacheService con TTL de 2 horas
    const cache = CacheService.getScriptCache();
    cache.put(
      CONFIG.CACHE_PREFIX + sessionToken,
      JSON.stringify(sesionData),
      CONFIG.SESSION_TTL
    );

    // Registrar login exitoso en logs de auditoría
    registrarLog(
      usuarioEncontrado.codigo,
      usuarioEncontrado.rol,
      'LOGIN_EXITOSO',
      '',
      `Usuario ${usuarioEncontrado.nombre} inició sesión correctamente`
    );

    Logger.log(`[AUTH] Login exitoso: ${usuarioEncontrado.nombre} (${usuarioEncontrado.rol})`);

    return {
      success: true,
      data: {
        sessionToken: sessionToken,
        nombre: usuarioEncontrado.nombre,
        rol:    usuarioEncontrado.rol,
        codigo: usuarioEncontrado.codigo
      },
      error: null
    };

  } catch (error) {
    Logger.log(`[LOGIN ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error durante el inicio de sesión.' };
  }
}

/**
 * Cierra la sesión de un usuario staff eliminando su token del caché.
 * @param {object} payload - { sessionToken: string }
 */
function logoutStaff(payload) {
  try {
    const token = payload.sessionToken || '';

    if (token) {
      const cache = CacheService.getScriptCache();
      const sesionJson = cache.get(CONFIG.CACHE_PREFIX + token);

      if (sesionJson) {
        const sesion = JSON.parse(sesionJson);
        // Registrar logout antes de eliminar la sesión
        registrarLog(sesion.codigo, sesion.rol, 'LOGOUT', '',
          `Usuario ${sesion.nombre} cerró sesión`);
        // Eliminar token del caché
        cache.remove(CONFIG.CACHE_PREFIX + token);
      }
    }

    return { success: true, data: { message: 'Sesión cerrada correctamente.' }, error: null };

  } catch (error) {
    Logger.log(`[LOGOUT ERROR] ${error.toString()}`);
    return { success: true, data: null, error: null }; // Logout siempre "exitoso" en cliente
  }
}

/**
 * Valida si un token de sesión existe y no ha expirado en CacheService.
 * @param {string} token - Token de sesión
 * @returns {{ valid: boolean, sesionData: object|null }}
 */
function validarSesion(token) {
  if (!token) return { valid: false, sesionData: null };

  try {
    const cache = CacheService.getScriptCache();
    const sesionJson = cache.get(CONFIG.CACHE_PREFIX + token);

    if (!sesionJson) {
      return { valid: false, sesionData: null };
    }

    const sesionData = JSON.parse(sesionJson);
    return { valid: true, sesionData: sesionData };

  } catch (error) {
    Logger.log(`[VALIDAR SESION ERROR] ${error.toString()}`);
    return { valid: false, sesionData: null };
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO DE TICKETS - Creación
// ─────────────────────────────────────────────────────────────

/**
 * Crea un nuevo ticket para un Alumno.
 * VALIDACIONES DE SEGURIDAD:
 * - Correo DEBE terminar en @alumnos.udg.mx (validación backend)
 * - Todos los campos obligatorios deben estar presentes
 * - Se sanitizan todos los inputs para prevenir XSS
 *
 * @param {object} payload - Datos del formulario del alumno
 */
function crearTicketAlumno(payload) {
  try {
    // Extraer y sanitizar campos
    const nombre   = sanitizarTexto(payload.nombre   || '');
    const correo   = sanitizarTexto(payload.correo   || '').toLowerCase().trim();
    const codigo   = sanitizarTexto(payload.codigo   || '');
    const telefono = sanitizarTexto(payload.telefono || '');
    const asunto   = sanitizarTexto(payload.asunto   || '');
    const notas    = sanitizarTexto(payload.notas    || '');
    const urgente  = payload.urgente === true || payload.urgente === 'true';
    const categoria = sanitizarTexto(payload.categoria || ''); // <

    // ── Validaciones obligatorias ──
    const errores = [];

    if (!nombre)   errores.push('El nombre completo es requerido.');
    if (!correo)   errores.push('El correo es requerido.');
    if (!codigo)   errores.push('El código de estudiante es requerido.');
    if (!telefono) errores.push('El teléfono es requerido.');
    if (!asunto)   errores.push('El asunto es requerido.');
    if (!notas)    errores.push('La descripción es requerida.');

    // ── VALIDACIÓN CRÍTICA DE SEGURIDAD: Dominio del correo ──
    if (correo && !correo.endsWith(CONFIG.DOMINIO_ALUMNOS)) {
      errores.push(`El correo debe pertenecer al dominio ${CONFIG.DOMINIO_ALUMNOS}`);
    }

    // Validar formato básico de correo
    if (correo && !validarFormatoCorreo(correo)) {
      errores.push('El formato del correo electrónico no es válido.');
    }

    // Validar longitud mínima de campos
    if (nombre.length < 3)  errores.push('El nombre debe tener al menos 3 caracteres.');
    if (asunto.length < 5)  errores.push('El asunto debe tener al menos 5 caracteres.');
    if (notas.length < 10)  errores.push('La descripción debe tener al menos 10 caracteres.');
    if (codigo.length < 4)  errores.push('El código de estudiante parece inválido.');

    if (errores.length > 0) {
      return { success: false, data: null, error: errores.join(' | ') };
    }

    // Generar ID único para el ticket
    const idTicket = generarIdTicket('ALU');
    const timestamp = new Date();

    // Preparar fila para insertar en Google Sheets
    // Orden: ID_Ticket|Timestamp|Nombre|Correo|Codigo_Estudiante|Telefono|Rol|Asunto|Descripcion|Urgente|Prioridad|Estado|Respuesta|Respondido_Por|Fecha_Respuesta|Oficina
    const filaTicket = [
      idTicket,
      timestamp,
      nombre,
      correo,
      codigo,
      telefono,
      'Alumno',
      asunto,
      notas,
      urgente ? 'Sí' : 'No',
      CONFIG.PRIORIDADES.SIN_ASIGNAR,
      CONFIG.ESTADOS.NUEVO,
      '',
      '',
      '',
      '',    // Oficina (vacía para alumno)
      categoria
    ];

    // Insertar en la hoja
    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    hoja.appendRow(filaTicket);

    // Registrar en logs de auditoría
    registrarLog(
      correo,
      'Alumno',
      'TICKET_CREADO',
      idTicket,
      `Alumno ${nombre} creó ticket: "${asunto}" | Urgente: ${urgente ? 'Sí' : 'No'}`
    );

    Logger.log(`[TICKET] Nuevo ticket de alumno: ${idTicket} por ${correo}`);

    return {
      success: true,
      data: {
        idTicket: idTicket,
        mensaje:  `Ticket ${idTicket} creado exitosamente. El equipo de soporte lo atenderá pronto.`
      },
      error: null
    };

  } catch (error) {
    Logger.log(`[CREAR TICKET ALUMNO ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al crear el ticket. Intenta de nuevo.' };
  }
}

/**
 * Crea un nuevo ticket para un Profesor.
 * Campos opcionales: oficina, teléfono
 * No requiere validación de dominio específico (puede ser cualquier correo institucional)
 *
 * @param {object} payload - Datos del formulario del profesor
 */
function crearTicketProfesor(payload) {
  try {
    // Extraer y sanitizar
    const nombre   = sanitizarTexto(payload.nombre   || '');
    const correo   = sanitizarTexto(payload.correo   || '').toLowerCase().trim();
    const oficina  = sanitizarTexto(payload.oficina  || '');
    const telefono = sanitizarTexto(payload.telefono || '');
    const asunto   = sanitizarTexto(payload.asunto   || '');
    const notas    = sanitizarTexto(payload.notas    || '');
    const urgente  = payload.urgente === true || payload.urgente === 'true';

    // Validaciones obligatorias para profesor
    const errores = [];

    if (!nombre) errores.push('El nombre es requerido.');
    if (!correo) errores.push('El correo institucional es requerido.');
    if (!asunto) errores.push('El asunto es requerido.');

    if (correo && !validarFormatoCorreo(correo)) {
      errores.push('El formato del correo electrónico no es válido.');
    }

    if (nombre.length < 3) errores.push('El nombre debe tener al menos 3 caracteres.');
    if (asunto.length < 5) errores.push('El asunto debe tener al menos 5 caracteres.');

    if (errores.length > 0) {
      return { success: false, data: null, error: errores.join(' | ') };
    }

    const idTicket = generarIdTicket('PRO');
    const timestamp = new Date();

    const filaTicket = [
      idTicket,
      timestamp,
      nombre,
      correo,
      '',       // Codigo_Estudiante (no aplica)
      telefono,
      'Profesor',
      asunto,
      notas,
      urgente ? 'Sí' : 'No',
      CONFIG.PRIORIDADES.SIN_ASIGNAR,
      CONFIG.ESTADOS.NUEVO,
      '',
      '',
      '',
      oficina,
      ''
    ];

    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    hoja.appendRow(filaTicket);

    registrarLog(
      correo,
      'Profesor',
      'TICKET_CREADO',
      idTicket,
      `Profesor ${nombre} creó ticket: "${asunto}"`
    );

    Logger.log(`[TICKET] Nuevo ticket de profesor: ${idTicket} por ${correo}`);

    return {
      success: true,
      data: {
        idTicket: idTicket,
        mensaje:  `Ticket ${idTicket} creado exitosamente.`
      },
      error: null
    };

  } catch (error) {
    Logger.log(`[CREAR TICKET PROFESOR ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al crear el ticket. Intenta de nuevo.' };
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO DE TICKETS - Consultas
// ─────────────────────────────────────────────────────────────

/**
 * Retorna los tickets de un alumno/profesor basado en su correo.
 * SEGURIDAD: Solo ve sus propios tickets, filtrado por correo en backend.
 *
 * @param {object} payload - { correo: string, rol: 'Alumno'|'Profesor' }
 */
function obtenerMisTickets(payload) {
  try {
    const correo = sanitizarTexto(payload.correo || '').toLowerCase().trim();
    const rol    = sanitizarTexto(payload.rol    || '');

    if (!correo || !validarFormatoCorreo(correo)) {
      return { success: false, data: null, error: 'Correo inválido.' };
    }

    // Validación adicional para alumnos: verificar dominio
    if (rol === 'Alumno' && !correo.endsWith(CONFIG.DOMINIO_ALUMNOS)) {
      return { success: false, data: null, error: 'Dominio de correo no autorizado para alumnos.' };
    }

    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    const datos = hoja.getDataRange().getValues();

    // Filtrar tickets donde el correo (columna 3, índice 3) coincida
    const misTickets = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const correoFila = String(fila[3]).toLowerCase().trim();

      if (correoFila === correo) {
        // Construir objeto de ticket con solo los campos necesarios para el cliente
        // NUNCA enviar datos sensibles de otros usuarios
       misTickets.push({
          idTicket:        fila[0],
          fecha:           formatearFecha(fila[1]),
          nombre:          fila[2],
          correo:          fila[3],
          rol:             fila[6],
          asunto:          fila[7],
          descripcion:     fila[8],
          urgente:         fila[9],
          prioridad:       fila[10],
          estado:          fila[11],
          respuesta:       fila[12],
          respondidoPor:   fila[13],
          fechaRespuesta:  formatearFecha(fila[14]),
          categoria:       fila[16] || ''
        });
      }
    }

    // Registrar la consulta en logs
    registrarLog(
      correo,
      rol || 'Desconocido',
      'CONSULTAR_MIS_TICKETS',
      '',
      `Consultó su historial de tickets (${misTickets.length} encontrados)`
    );

    // Ordenar por fecha más reciente primero
    misTickets.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return {
      success: true,
      data: { tickets: misTickets, total: misTickets.length },
      error: null
    };

  } catch (error) {
    Logger.log(`[OBTENER MIS TICKETS ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al obtener tus tickets.' };
  }
}

/**
 * Retorna TODOS los tickets para el dashboard de staff.
 * Solo accesible con sesión válida (Asistente o Coordinador).
 *
 * @param {object} payload - Debe incluir _sesion (inyectado por accionProtegida)
 */
function obtenerTodosTickets(payload) {
  try {
    const sesion = payload._sesion;

    // Validar que sea un rol de staff
    if (!['Asistente', 'Coordinador'].includes(sesion.rol)) {
      return { success: false, data: null, error: 'Rol sin permisos para esta acción.' };
    }

    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    const datos = hoja.getDataRange().getValues();

    const todosTickets = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];

      // Incluir fila solo si tiene ID de ticket válido
      if (!fila[0]) continue;

      todosTickets.push({
        rowIndex:        i + 1,
        idTicket:        fila[0],
        fecha:           formatearFecha(fila[1]),
        nombre:          fila[2],
        correo:          fila[3],
        codigoEstudiante: fila[4],
        telefono:        fila[5],
        rol:             fila[6],
        asunto:          fila[7],
        descripcion:     fila[8],
        urgente:         fila[9],
        prioridad:       fila[10],
        estado:          fila[11],
        respuesta:       fila[12],
        respondidoPor:   fila[13],
        fechaRespuesta:  formatearFecha(fila[14]),
        oficina:         fila[15],
        categoria:       fila[16] || ''
      });
    }

    // Registrar acceso al dashboard
    registrarLog(
      sesion.codigo,
      sesion.rol,
      'VER_TODOS_TICKETS',
      '',
      `${sesion.nombre} accedió al dashboard con ${todosTickets.length} tickets`
    );

    // Ordenar: tickets urgentes primero, luego por fecha
    todosTickets.sort((a, b) => {
      if (a.urgente === 'Sí' && b.urgente !== 'Sí') return -1;
      if (a.urgente !== 'Sí' && b.urgente === 'Sí') return 1;
      return new Date(b.fecha) - new Date(a.fecha);
    });

    return {
      success: true,
      data: { tickets: todosTickets, total: todosTickets.length },
      error: null
    };

  } catch (error) {
    Logger.log(`[OBTENER TODOS TICKETS ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al obtener los tickets.' };
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO DE TICKETS - Acciones de Staff
// ─────────────────────────────────────────────────────────────

/**
 * Actualiza la prioridad de un ticket (Triage por Asistente o Coordinador).
 *
 * @param {object} payload - { idTicket, prioridad, sessionToken, _sesion }
 */
function actualizarPrioridad(payload) {
  try {
    const sesion    = payload._sesion;
    const idTicket  = sanitizarTexto(payload.idTicket  || '');
    const prioridad = sanitizarTexto(payload.prioridad || '');

    // Solo Asistente y Coordinador pueden cambiar prioridad
    if (!['Asistente', 'Coordinador'].includes(sesion.rol)) {
      return { success: false, data: null, error: 'No tienes permisos para esta acción.' };
    }

    // Validar que la prioridad sea un valor permitido
    const prioridadesValidas = Object.values(CONFIG.PRIORIDADES);
    if (!prioridadesValidas.includes(prioridad)) {
      return { success: false, data: null, error: 'Prioridad no válida.' };
    }

    if (!idTicket) {
      return { success: false, data: null, error: 'ID de ticket requerido.' };
    }

    // Encontrar el ticket en la hoja
    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    const datos = hoja.getDataRange().getValues();

    let filaEncontrada = -1;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(idTicket)) {
        filaEncontrada = i + 1; // 1-based para Sheets
        break;
      }
    }

    if (filaEncontrada === -1) {
      return { success: false, data: null, error: `Ticket ${idTicket} no encontrado.` };
    }

    const prioridadAnterior = datos[filaEncontrada - 1][10];

    // Actualizar columna K (índice 11, 1-based) = Prioridad
    hoja.getRange(filaEncontrada, 11).setValue(prioridad);

    // Si era "Sin Asignar", cambiar estado a "En Proceso"
    if (prioridadAnterior === CONFIG.PRIORIDADES.SIN_ASIGNAR) {
      hoja.getRange(filaEncontrada, 12).setValue(CONFIG.ESTADOS.EN_PROCESO);
    }

    // Registrar en logs
    registrarLog(
      sesion.codigo,
      sesion.rol,
      'PRIORIDAD_ACTUALIZADA',
      idTicket,
      `${sesion.nombre} cambió prioridad de "${prioridadAnterior}" a "${prioridad}"`
    );

    Logger.log(`[PRIORIDAD] Ticket ${idTicket}: ${prioridadAnterior} → ${prioridad} por ${sesion.nombre}`);

    return {
      success: true,
      data: {
        idTicket:          idTicket,
        prioridadNueva:    prioridad,
        prioridadAnterior: prioridadAnterior,
        mensaje:           `Prioridad del ticket ${idTicket} actualizada a "${prioridad}"`
      },
      error: null
    };

  } catch (error) {
    Logger.log(`[ACTUALIZAR PRIORIDAD ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al actualizar la prioridad.' };
  }
}

/**
 * Responde un ticket (Solo Coordinador).
 * Al responder: Estado → "Resuelto", guarda respuesta y timestamp.
 *
 * @param {object} payload - { idTicket, respuesta, sessionToken, _sesion }
 */
function responderTicket(payload) {
  try {
    const sesion    = payload._sesion;
    const idTicket  = sanitizarTexto(payload.idTicket  || '');
    const respuesta = sanitizarTexto(payload.respuesta || '');

    // SOLO el Coordinador puede responder tickets
    if (sesion.rol !== 'Coordinador') {
      registrarLog(
        sesion.codigo,
        sesion.rol,
        'INTENTO_RESPONDER_SIN_PERMISO',
        idTicket,
        `${sesion.nombre} intentó responder ticket sin permisos de Coordinador`
      );
      return { success: false, data: null, error: 'Solo el Coordinador puede responder tickets.' };
    }

    if (!idTicket) {
      return { success: false, data: null, error: 'ID de ticket requerido.' };
    }

    if (!respuesta || respuesta.length < 10) {
      return { success: false, data: null, error: 'La respuesta debe tener al menos 10 caracteres.' };
    }

    // Buscar el ticket
    const hoja = obtenerHoja(CONFIG.SHEETS.TICKETS);
    const datos = hoja.getDataRange().getValues();

    let filaEncontrada = -1;
    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(idTicket)) {
        filaEncontrada = i + 1;
        break;
      }
    }

    if (filaEncontrada === -1) {
      return { success: false, data: null, error: `Ticket ${idTicket} no encontrado.` };
    }

    const estadoActual = datos[filaEncontrada - 1][11];

    // No re-responder un ticket ya cerrado
    if (estadoActual === CONFIG.ESTADOS.CERRADO) {
      return { success: false, data: null, error: 'Este ticket ya está cerrado y no puede ser modificado.' };
    }

    const ahora = new Date();

    // Actualizar columnas: Respuesta(13), Respondido_Por(14), Fecha_Respuesta(15), Estado(12)
    hoja.getRange(filaEncontrada, 13).setValue(respuesta);           // Respuesta
    hoja.getRange(filaEncontrada, 14).setValue(sesion.nombre);       // Respondido_Por
    hoja.getRange(filaEncontrada, 15).setValue(ahora);               // Fecha_Respuesta
    hoja.getRange(filaEncontrada, 12).setValue(CONFIG.ESTADOS.RESUELTO); // Estado

    // Registrar en logs de auditoría
    registrarLog(
      sesion.codigo,
      sesion.rol,
      'TICKET_RESPONDIDO',
      idTicket,
      `Coordinador ${sesion.nombre} respondió ticket. Respuesta: "${respuesta.substring(0, 100)}..."`
    );

    Logger.log(`[RESPUESTA] Ticket ${idTicket} respondido por ${sesion.nombre}`);

    return {
      success: true,
      data: {
        idTicket:  idTicket,
        estado:    CONFIG.ESTADOS.RESUELTO,
        mensaje:   `Ticket ${idTicket} marcado como Resuelto correctamente.`
      },
      error: null
    };

  } catch (error) {
    Logger.log(`[RESPONDER TICKET ERROR] ${error.toString()}`);
    return { success: false, data: null, error: 'Error al responder el ticket.' };
  }
}

// ─────────────────────────────────────────────────────────────
// SISTEMA DE LOGS INMUTABLES - Auditoría
// ─────────────────────────────────────────────────────────────

/**
 * Registra una entrada en la tabla de auditoría inmutable.
 * REGLA: Solo se puede hacer appendRow. Nunca update ni delete.
 * Esta función es llamada por TODAS las operaciones del sistema.
 *
 * @param {string} usuario  - Identificador del usuario (correo o código)
 * @param {string} rol      - Rol del usuario
 * @param {string} accion   - Código de acción realizada
 * @param {string} idTicket - ID del ticket afectado (puede ser vacío)
 * @param {string} detalles - Descripción detallada de la acción
 */
function registrarLog(usuario, rol, accion, idTicket, detalles) {
  try {
    const hoja = obtenerHoja(CONFIG.SHEETS.LOGS);
    const ahora = new Date();

    // Generar ID único para el log
    const idLog = 'LOG-' + ahora.getTime() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();

    // Construir fila de log
    // Orden: ID_Log|Timestamp|Usuario|Rol|Accion|ID_Ticket|Detalles|IP_Aproximada
    const filaLog = [
      idLog,
      ahora,
      String(usuario).substring(0, 100),   // Limitar longitud
      String(rol).substring(0, 50),
      String(accion).substring(0, 100),
      String(idTicket).substring(0, 50),
      String(detalles).substring(0, 500),  // Limitar detalles
      'N/A'  // Apps Script no expone IP del cliente directamente
    ];

    // INSERCIÓN INMUTABLE - Solo appendRow, nunca setValue en filas existentes
    hoja.appendRow(filaLog);

  } catch (error) {
    // Si el log falla, registrar en Logger de Apps Script pero NO detener el flujo principal
    Logger.log(`[LOG ERROR - CRÍTICO] No se pudo registrar log: ${error.toString()}`);
    Logger.log(`[LOG FALLIDO] Usuario:${usuario} | Acción:${accion} | Ticket:${idTicket}`);
  }
}

// ─────────────────────────────────────────────────────────────
// FUNCIONES UTILITARIAS - Helpers internos
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene una hoja de cálculo por nombre.
 * Lanza error descriptivo si la hoja no existe.
 * @param {string} nombreHoja - Nombre de la hoja a obtener
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function obtenerHoja(nombreHoja) {
  const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const hoja = ss.getSheetByName(nombreHoja);

  if (!hoja) {
    throw new Error(`Hoja "${nombreHoja}" no encontrada en el Spreadsheet. Verifica la configuración.`);
  }

  return hoja;
}

/**
 * Sanitiza un string para prevenir XSS e inyecciones.
 * Elimina tags HTML y caracteres potencialmente peligrosos.
 * @param {string} texto - Texto a sanitizar
 * @returns {string} Texto limpio
 */
function sanitizarTexto(texto) {
  if (typeof texto !== 'string') return String(texto || '');
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
    .substring(0, 2000);
}

/**
 * Valida el formato básico de un correo electrónico.
 * @param {string} correo
 * @returns {boolean}
 */
function validarFormatoCorreo(correo) {
  const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return regex.test(correo);
}

/**
 * Genera un ID único para tickets con prefijo de rol.
 * Formato: ALU-20240115-A3F2B
 * @param {string} prefijo - 'ALU' o 'PRO'
 * @returns {string}
 */
function generarIdTicket(prefijo) {
  const ahora = new Date();
  const fecha = Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyyMMdd');
  const aleatorio = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `${prefijo}-${fecha}-${aleatorio}`;
}

/**
 * Genera un token de sesión criptográficamente aleatorio.
 * @returns {string} Token de 64 caracteres
 */
function generarToken() {
  const parte1 = Utilities.getUuid().replace(/-/g, '');
  const parte2 = Utilities.getUuid().replace(/-/g, '');
  return (parte1 + parte2).toUpperCase();
}

/**
 * Implementa SHA-256 usando las utilidades de Apps Script.
 * Se usa para hashear contraseñas antes de compararlas.
 *
 * NOTA DE PRODUCCIÓN: Para mayor seguridad, usar bcrypt via
 * una Cloud Function externa. Apps Script no soporta bcrypt nativo.
 *
 * @param {string} texto - Texto a hashear
 * @returns {string} Hash hexadecimal
 */
function hashSHA256(texto) {
  const bytes  = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );

  // Convertir array de bytes a string hexadecimal
  return bytes.map(b => {
    const hex = (b & 0xff).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Formatea una fecha para mostrar al cliente.
 * @param {Date|string} fecha
 * @returns {string} Fecha formateada o cadena vacía
 */
function formatearFecha(fecha) {
  if (!fecha) return '';
  try {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return String(fecha);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  } catch (e) {
    return String(fecha);
  }
}

/**
 * Función de utilidad para crear usuarios staff.
 * EJECUTAR MANUALMENTE UNA SOLA VEZ para poblar la hoja Usuarios.
 * NO exponer como endpoint público.
 *
 * Uso: crearUsuarioStaff('AST001', 'Juan García', 'Asistente', 'miPassword123')
 */
function crearUsuarioStaff(codigo, nombre, rol, password) {
  const hoja = obtenerHoja(CONFIG.SHEETS.USUARIOS);
  const idUsuario = 'USR-' + new Date().getTime();
  const hash = hashSHA256(password);

  hoja.appendRow([idUsuario, nombre, codigo, hash, rol, 'true']);

  Logger.log(`Usuario creado: ${codigo} | Rol: ${rol} | Hash: ${hash}`);
  Logger.log('⚠️ ELIMINA O DESHABILITA ESTA FUNCIÓN EN PRODUCCIÓN');
}
