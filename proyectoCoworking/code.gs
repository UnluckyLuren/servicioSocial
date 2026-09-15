/**
 * ============================================================
 * CUCEI COWORKING SYSTEM - Backend Principal
 * Code.gs
 * ============================================================
 * Arquitectura modular con funciones separadas por dominio.
 * Utiliza Google Sheets como base de datos y MailApp para notificaciones.
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// CONSTANTES DE CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  SHEET_USUARIOS:    'usuarios',
  SHEET_RESERVAS:    'capacidad',
  SHEET_LOGS:        'logs',
  SHEET_CONFIG:      'Configuracion',
  SHEET_REGISTROS:   'Registros',

  DOMINIOS_ALUMNO:   ['@alumnos.udg.mx', '@academicos.udg.mx', '@cucei.udg.mx'],
  DOMINIOS_ADMIN:    ['@academicos.udg.mx', '@cucei.udg.mx'],

  ESTADOS: {
    PENDIENTE: 'Pendiente',
    ACEPTADA:  'Aceptada',
    RECHAZADA: 'Rechazada'
  },

  // Correo del administrador principal (actualizar)
  CORREO_ADMIN: 'admin@cucei.udg.mx',

  // Horas de operación
  HORA_APERTURA: '08:00',
  HORA_CIERRE:   '20:00'
};

// ─────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA: doGet
// ─────────────────────────────────────────────────────────────

/**
 * Punto de entrada principal de la aplicación web.
 * Verifica el acceso del usuario y sirve el HTML apropiado.
 * @returns {HtmlOutput} La página web renderizada
 */
function doGet() {
  try {
    // Inicializar hojas si no existen
    inicializarHojas_();

    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Coworkings CUCEI - Reservas')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

  } catch (error) {
    registrarLog_('SISTEMA', 'ERROR_DOGet', error.toString());
    return HtmlService.createHtmlOutput(
      'Error al cargar la aplicación.'
    );
  }
}

/**
 * Incluye archivos externos en las plantillas HTML.
 * Uso: <?!= include('filename'); ?> en el HTML
 * @param {string} filename - Nombre del archivo a incluir
 * @returns {string} Contenido del archivo
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: AUTENTICACIÓN Y CONTROL DE ACCESO
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene la información completa del usuario activo y su rol.
 * Es la función principal que el frontend llama al iniciar.
 * @returns {Object} { correo, nombre, rol, accesoConcedido }
 */
function obtenerInfoUsuario() {
  try {
    const correo = Session.getActiveUser().getEmail();

    if (!correo || correo === '') {
      return {
        accesoConcedido: false,
        rol: 'anonimo',
        mensaje: 'No se pudo identificar tu cuenta de Google. Asegúrate de estar autenticado.'
      };
    }

    const rol = determinarRolUsuario_(correo);

    if (rol === 'denegado') {
      registrarLog_(correo, 'ACCESO_DENEGADO', `Intento de acceso con dominio no permitido: ${correo}`);
      return {
        accesoConcedido: false,
        rol: 'denegado',
        correo: correo,
        mensaje: 'Tu correo no pertenece a un dominio institucional de CUCEI autorizado.'
      };
    }

    // Registrar o actualizar usuario en la hoja 'usuarios'
    registrarOActualizarUsuario_(correo, rol);

    registrarLog_(correo, 'ACCESO_CONCEDIDO', `Rol asignado: ${rol}`);

    return {
      accesoConcedido: true,
      rol: rol,
      correo: correo
    };

  } catch (error) {
    registrarLog_('ERROR', 'obtenerInfoUsuario', error.toString());
    return {
      accesoConcedido: false,
      rol: 'error',
      mensaje: 'Error interno al verificar identidad: ' + error.toString()
    };
  }
}

// Para calar el admin
// function obtenerInfoUsuario() {
//   try {
//     // 🚀 MOCK PARA PRUEBAS: Forzar vista de administrador
//     // Se comenta la validación real de Session.getActiveUser().getEmail()

//     const correoSimulado = 'martha.angulo8828@alumnos.udg.mx';
//     const rolSimulado = 'admin';
//     // const rolSimulado = 'alumno';

//     // Opcional: Registrar el acceso simulado en los logs para que no falle esa parte
//     registrarOActualizarUsuario_(correoSimulado, rolSimulado);
//     registrarLog_(correoSimulado, 'ACCESO_CONCEDIDO_SIMULADO', `Rol asignado: ${rolSimulado}`);

//     return {
//       accesoConcedido: true,
//       rol: rolSimulado,
//       correo: correoSimulado
//     };

//   } catch (error) {
//     return {
//       accesoConcedido: false,
//       rol: 'error',
//       mensaje: 'Error interno en el mock: ' + error.toString()
//     };
//   }
// }

/**
 * Determina el rol de un usuario según su dominio de correo.
 * @param {string} correo - Correo electrónico del usuario
 * @returns {string} 'admin' | 'alumno' | 'denegado'
 * @private
 */
function determinarRolUsuario_(correo) {
  const correoLower = correo.toLowerCase();

  // Admin tiene prioridad si el dominio coincide
  const esAdmin = CONFIG.DOMINIOS_ADMIN.some(d => correoLower.endsWith(d));
  if (esAdmin) return 'admin';

  const esAlumno = CONFIG.DOMINIOS_ALUMNO.some(d => correoLower.endsWith(d));
  if (esAlumno) return 'alumno';

  return 'denegado';
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: RESERVAS (Alumno)
// ─────────────────────────────────────────────────────────────

/**
 * Registra una nueva reserva de coworking.
 * Valida colisiones antes de guardar y envía correo de confirmación.
 * @param {Object} datos - Datos del formulario de reserva
 * @returns {Object} { exito: boolean, mensaje: string }
 */
function registrarReserva(datos) {
  try {
    // 1. Validar que el usuario tenga acceso
    const infoUsuario = obtenerInfoUsuario();
    if (!infoUsuario.accesoConcedido) {
      return { exito: false, mensaje: 'Acceso denegado. No tienes permiso para crear reservas.' };
    }

    // 2. Validar datos mínimos requeridos
    const validacion = validarDatosReserva_(datos);
    if (!validacion.valido) {
      return { exito: false, mensaje: validacion.mensaje };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const nombreCompleto = `${datos.nombres} ${datos.apellidoPaterno} ${datos.apellidoMaterno}`.trim();
    const odsTexto = (datos.ods && datos.ods.length > 0) ? datos.ods.join(', ') : 'Ninguno seleccionado';

    const reservasCreadas = [];

    // 3. Procesar cada fecha seleccionada
    for (const fechaSol of datos.fechas) {

      // 4. VALIDACIÓN CRÍTICA: Verificar colisiones de horario
      const colision = verificarColision_(
        sheetReservas,
        datos.coworking,
        fechaSol,
        datos.horaEntrada,
        datos.horaSalida
      );

      if (colision.hayColision) {
        registrarLog_(
          datos.correo,
          'COLISION_DETECTADA',
          `Coworking: ${datos.coworking}, Fecha: ${fechaSol}, Hora: ${datos.horaEntrada}-${datos.horaSalida}`
        );
        return {
          exito: false,
          mensaje: `Conflicto de horario para el ${formatearFechaLegible_(fechaSol)}: ${colision.mensaje}`
        };
      }

      // 5. Generar ID único para la reserva
      const idReserva = generarIdReserva_();

      // 6. Guardar en Google Sheets
      sheetReservas.appendRow([
        idReserva,                          // A: ID_Reserva
        datos.correo,                       // B: Correo
        fechaSol,                           // C: Fecha
        datos.horaEntrada,                  // D: Hora_Inicio
        datos.horaSalida,                   // E: Hora_Fin
        CONFIG.ESTADOS.PENDIENTE,           // F: Estado
        datos.coworking,                    // G: Espacio/Aula
        nombreCompleto,                     // H: Nombre_Completo
        datos.codigo,                       // I: Codigo
        datos.telefono,                     // J: Telefono
        datos.extension || 'N/A',           // K: Extension
        datos.rol,                          // L: Rol_Usuario
        datos.actividad,                    // M: Actividad
        datos.descripcionActividad,         // N: Descripcion
        odsTexto,                           // O: ODS
        new Date()                          // P: Fecha_Registro
      ]);

      reservasCreadas.push(idReserva);
    }

    // 7. Registrar en log
    registrarLog_(
      datos.correo,
      'RESERVA_CREADA',
      `IDs: ${reservasCreadas.join(', ')} | Coworking: ${datos.coworking} | Fechas: ${datos.fechas.join(', ')}`
    );

    // 8. Enviar correo de confirmación al usuario
    enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, reservasCreadas);

    // 9. Integración legacy con hoja "Registros" y Google Calendar (compatibilidad)
    try {
      procesarRegistroLegacy_(datos, nombreCompleto, odsTexto);
    } catch (legacyError) {
      // No bloquear el flujo principal si el legacy falla
      registrarLog_(datos.correo, 'ADVERTENCIA_LEGACY', legacyError.toString());
    }

    return {
      exito: true,
      mensaje: `✅ ¡Reserva${reservasCreadas.length > 1 ? 's' : ''} creada${reservasCreadas.length > 1 ? 's' : ''} con éxito! Recibirás un correo de confirmación en ${datos.correo}. Estado: En espera de validación.`
    };

  } catch (error) {
    registrarLog_('ERROR', 'registrarReserva', error.toString());
    return {
      exito: false,
      mensaje: 'Error interno al procesar la reserva. Por favor intenta de nuevo. ' + error.toString()
    };
  }
}

/**
 * Verifica si existe una colisión de horario para un espacio y fecha específicos.
 * Una colisión ocurre cuando la reserva nueva se superpone con una existente
 * en estado Pendiente o Aceptada.
 * @param {Sheet} sheet - Hoja de reservas
 * @param {string} coworking - Nombre del espacio
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @param {string} horaInicio - Hora de inicio HH:MM
 * @param {string} horaFin - Hora de fin HH:MM
 * @returns {Object} { hayColision: boolean, mensaje: string }
 * @private
 */
function verificarColision_(sheet, coworking, fecha, horaInicio, horaFin) {
  const ultimaFila = sheet.getLastRow();

  // Si solo hay encabezado o está vacía, no hay colisión
  if (ultimaFila <= 1) {
    return { hayColision: false };
  }

  const registros = sheet.getRange(2, 1, ultimaFila - 1, 7).getValues();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  const inicioNuevo = convertirHoraAMinutos_(horaInicio);
  const finNuevo    = convertirHoraAMinutos_(horaFin);

  for (const fila of registros) {
    const [, correoExist, fechaExist, hiExist, hfExist, estadoExist, coworkingExist] = fila;

    // Solo evaluar reservas activas (Pendiente o Aceptada)
    if (estadoExist !== CONFIG.ESTADOS.PENDIENTE && estadoExist !== CONFIG.ESTADOS.ACEPTADA) {
      continue;
    }

    // Verificar mismo coworking
    if (String(coworkingExist).trim().toLowerCase() !== coworking.trim().toLowerCase()) {
      continue;
    }

    // Normalizar fecha de la hoja (puede ser Date o string)
    let fechaNorm;
    try {
      fechaNorm = fechaExist instanceof Date
        ? Utilities.formatDate(fechaExist, tz, 'yyyy-MM-dd')
        : String(fechaExist).trim();
    } catch (e) {
      continue;
    }

    if (fechaNorm !== fecha) continue;

    // Verificar superposición de rangos horarios
    const inicioExist = convertirHoraAMinutos_(String(hiExist).substring(0, 5));
    const finExist    = convertirHoraAMinutos_(String(hfExist).substring(0, 5));

    // Algoritmo de superposición de intervalos: A se superpone con B si A.inicio < B.fin && A.fin > B.inicio
    if (inicioNuevo < finExist && finNuevo > inicioExist) {
      return {
        hayColision: true,
        mensaje: `El horario ${horaInicio}–${horaFin} se superpone con una reserva existente (${hiExist}–${hfExist}) en estado "${estadoExist}".`
      };
    }
  }

  return { hayColision: false };
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: DASHBOARD ADMINISTRADOR
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene todos los datos necesarios para el dashboard del administrador.
 * Incluye métricas, lista de reservas y datos para gráficas.
 * @returns {Object} Datos completos del dashboard
 */
function obtenerDashboardAdmin() {
  try {
    // Verificar que sea administrador
    const infoUsuario = obtenerInfoUsuario();
    if (!infoUsuario.accesoConcedido || infoUsuario.rol !== 'admin') {
      return { exito: false, mensaje: 'Acceso denegado. Se requieren permisos de administrador.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila = sheetReservas.getLastRow();

    if (ultimaFila <= 1) {
      return {
        exito: true,
        reservas: [],
        metricas: { total: 0, pendientes: 0, aceptadas: 0, rechazadas: 0 },
        graficaEstados: { labels: ['Pendiente', 'Aceptada', 'Rechazada'], datos: [0, 0, 0] },
        graficaEspacios: { labels: [], datos: [] }
      };
    }

    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, 16).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    const reservas = [];

    // Contadores para métricas
    let pendientes = 0, aceptadas = 0, rechazadas = 0;
    const espaciosConteo = {};

    for (const fila of datos) {
      const [idReserva, correo, fecha, horaInicio, horaFin, estado, coworking,
             nombreCompleto, codigo, telefono, extension, rol,
             actividad, descripcion, ods, fechaRegistro] = fila;

      if (!idReserva) continue; // Saltar filas vacías

      // Normalizar fecha
      let fechaStr = '';
      try {
        fechaStr = fecha instanceof Date
          ? Utilities.formatDate(fecha, tz, 'yyyy-MM-dd')
          : String(fecha).trim();
      } catch (e) {
        fechaStr = String(fecha).trim();
      }

      // Contar por estado
      switch(estado) {
        case CONFIG.ESTADOS.PENDIENTE:  pendientes++;  break;
        case CONFIG.ESTADOS.ACEPTADA:   aceptadas++;   break;
        case CONFIG.ESTADOS.RECHAZADA:  rechazadas++;  break;
      }

      // Contar por espacio
      const coworkingKey = String(coworking).trim();
      espaciosConteo[coworkingKey] = (espaciosConteo[coworkingKey] || 0) + 1;

      reservas.push({
        idReserva:      String(idReserva),
        correo:         String(correo),
        fecha:          fechaStr,
        horaInicio:     formatearHoraSegura_(horaInicio),
        horaFin:        formatearHoraSegura_(horaFin),
        estado:         String(estado),
        coworking:      coworkingKey,
        nombreCompleto: String(nombreCompleto),
        codigo:         String(codigo),
        telefono:       String(telefono),
        extension:      String(extension),
        rol:            String(rol),
        actividad:      String(actividad),
        descripcion:    String(descripcion),
        ods:            String(ods),
        fechaRegistro:  fechaRegistro instanceof Date
                          ? Utilities.formatDate(fechaRegistro, tz, 'dd/MM/yyyy HH:mm')
                          : String(fechaRegistro)
      });
    }

    // Ordenar reservas: pendientes primero, luego por fecha desc
    reservas.sort((a, b) => {
      const prioridad = { 'Pendiente': 0, 'Aceptada': 1, 'Rechazada': 2 };
      if (prioridad[a.estado] !== prioridad[b.estado]) {
        return prioridad[a.estado] - prioridad[b.estado];
      }
      return b.fecha.localeCompare(a.fecha);
    });

    registrarLog_(infoUsuario.correo, 'DASHBOARD_CONSULTADO', `Total registros: ${reservas.length}`);

    return {
      exito: true,
      reservas: reservas,
      metricas: {
        total:      reservas.length,
        pendientes: pendientes,
        aceptadas:  aceptadas,
        rechazadas: rechazadas
      },
      graficaEstados: {
        labels: ['Pendiente', 'Aceptada', 'Rechazada'],
        datos:  [pendientes, aceptadas, rechazadas]
      },
      graficaEspacios: {
        labels: Object.keys(espaciosConteo),
        datos:  Object.values(espaciosConteo)
      }
    };

  } catch (error) {
    registrarLog_('ERROR', 'obtenerDashboardAdmin', error.toString());
    return { exito: false, mensaje: 'Error al cargar el dashboard: ' + error.toString() };
  }
}

/**
 * Actualiza el estado de una reserva (Aceptada o Rechazada).
 * Regla de negocio: Una reserva Aceptada NO puede modificarse.
 * @param {string} idReserva - ID único de la reserva
 * @param {string} nuevoEstado - 'Aceptada' o 'Rechazada'
 * @returns {Object} { exito: boolean, mensaje: string }
 */

function actualizarEstadoReserva(idReserva, nuevoEstado) {
  try {
    const infoUsuario = obtenerInfoUsuario();
    if (!infoUsuario.accesoConcedido || infoUsuario.rol !== 'admin') {
      return { exito: false, mensaje: 'Acceso denegado. Solo administradores pueden cambiar el estado.' };
    }

    const estadosPermitidos = [CONFIG.ESTADOS.ACEPTADA, CONFIG.ESTADOS.RECHAZADA];
    if (!estadosPermitidos.includes(nuevoEstado)) {
      return { exito: false, mensaje: `Estado inválido: "${nuevoEstado}".` };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila = sheetReservas.getLastRow();

    if (ultimaFila <= 1) {
      return { exito: false, mensaje: 'No se encontraron reservas en el sistema.' };
    }

    // MODIFICADO: Leer 16 columnas en lugar de 8 para obtener todos los detalles
    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, 16).getValues();

    for (let i = 0; i < datos.length; i++) {
      const [idFila, correoFila, , , , estadoFila] = datos[i];

      if (String(idFila).trim() !== String(idReserva).trim()) continue;

      if (estadoFila === CONFIG.ESTADOS.ACEPTADA) {
        registrarLog_(infoUsuario.correo, 'INTENTO_MODIFICACION_BLOQUEADO', `ID: ${idReserva} ya está Aceptada.`);
        return { exito: false, mensaje: '🔒 Esta reserva ya fue Aceptada y no puede modificarse.' };
      }

      const filaHoja = i + 2;
      sheetReservas.getRange(filaHoja, 6).setValue(nuevoEstado);

      registrarLog_(infoUsuario.correo, `RESERVA_${nuevoEstado.toUpperCase()}`, `ID: ${idReserva} | Usuario: ${correoFila} | Admin: ${infoUsuario.correo}`);

      enviarNotificacionCambioEstado_(String(correoFila), idReserva, nuevoEstado, datos[i]);

      // NUEVO: Crear evento en Google Calendar si fue aprobada
      if (nuevoEstado === CONFIG.ESTADOS.ACEPTADA) {
        crearEventoCalendario_(datos[i]);
      }

      return { exito: true, mensaje: `✅ Reserva ${idReserva} marcada como "${nuevoEstado}" exitosamente.` };
    }

    return { exito: false, mensaje: `No se encontró la reserva con ID: ${idReserva}` };

  } catch (error) {
    registrarLog_('ERROR', 'actualizarEstadoReserva', error.toString());
    return { exito: false, mensaje: 'Error al actualizar el estado: ' + error.toString() };
  }
}

/**
 * Busca el historial de reservas de un usuario por correo electrónico.
 * @param {string} correoBusqueda - Correo a buscar
 * @returns {Object} { exito: boolean, reservas: Array }
 */
function buscarReservasPorCorreo(correoBusqueda) {
  try {
    // Validar permisos
    const infoUsuario = obtenerInfoUsuario();
    if (!infoUsuario.accesoConcedido || infoUsuario.rol !== 'admin') {
      return { exito: false, mensaje: 'Acceso denegado.' };
    }

    if (!correoBusqueda || correoBusqueda.trim() === '') {
      return { exito: false, mensaje: 'Por favor ingresa un correo para buscar.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila = sheetReservas.getLastRow();

    if (ultimaFila <= 1) {
      return { exito: true, reservas: [], mensaje: 'No hay reservas registradas.' };
    }

    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, 16).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    const resultados = [];
    const busquedaLower = correoBusqueda.trim().toLowerCase();

    for (const fila of datos) {
      const [idReserva, correo, fecha, horaInicio, horaFin, estado, coworking,
             nombreCompleto, codigo, telefono, extension, rol,
             actividad, descripcion, ods, fechaRegistro] = fila;

      if (!String(correo).toLowerCase().includes(busquedaLower)) continue;

      let fechaStr = '';
      try {
        fechaStr = fecha instanceof Date
          ? Utilities.formatDate(fecha, tz, 'yyyy-MM-dd')
          : String(fecha).trim();
      } catch (e) { fechaStr = String(fecha).trim(); }

      resultados.push({
        idReserva:      String(idReserva),
        correo:         String(correo),
        fecha:          fechaStr,
        horaInicio:     String(horaInicio).substring(0, 5),
        horaFin:        String(horaFin).substring(0, 5),
        estado:         String(estado),
        coworking:      String(coworking),
        nombreCompleto: String(nombreCompleto),
        codigo:         String(codigo),
        actividad:      String(actividad),
        fechaRegistro:  fechaRegistro instanceof Date
                          ? Utilities.formatDate(fechaRegistro, tz, 'dd/MM/yyyy HH:mm')
                          : String(fechaRegistro)
      });
    }

    registrarLog_(
      infoUsuario.correo,
      'BUSQUEDA_REALIZADA',
      `Búsqueda: "${correoBusqueda}" | Resultados: ${resultados.length}`
    );

    return {
      exito: true,
      reservas: resultados,
      total: resultados.length,
      mensaje: resultados.length > 0
        ? `Se encontraron ${resultados.length} reserva(s) para "${correoBusqueda}".`
        : `No se encontraron reservas para "${correoBusqueda}".`
    };

  } catch (error) {
    registrarLog_('ERROR', 'buscarReservasPorCorreo', error.toString());
    return { exito: false, mensaje: 'Error en la búsqueda: ' + error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: CORREOS ELECTRÓNICOS
// ─────────────────────────────────────────────────────────────

/**
 * Envía el correo de confirmación de reserva al usuario.
 * Usa plantilla HTML profesional con identidad CUCEI.
 * @param {Object} datos - Datos de la reserva
 * @param {string} nombreCompleto - Nombre completo del usuario
 * @param {string} odsTexto - Texto de ODS seleccionados
 * @param {Array} idsReservas - IDs de las reservas creadas
 * @private
 */
function enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, idsReservas) {
  try {
    const fechasFormateadas = datos.fechas
      .map(f => {
        const partes = f.split('-');
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
      })
      .join(', ');

    const asunto = `📋 Solicitud de Reserva Recibida – ${datos.coworking} | CUCEI`;

    const cuerpoHtml = generarPlantillaCorreo_({
      titulo:      'Solicitud de Reserva Recibida',
      subtitulo:   'Tu solicitud está en espera de confirmación',
      nombreUsuario: datos.nombres,
      estado:      'En espera de confirmación',
      estadoColor: '#f59e0b',
      detalles: [
        { etiqueta: 'Espacio / Aula',        valor: datos.coworking },
        { etiqueta: 'Actividad',             valor: datos.actividad },
        { etiqueta: 'Fecha(s)',              valor: fechasFormateadas },
        { etiqueta: 'Horario',              valor: `${datos.horaEntrada} – ${datos.horaSalida} hrs` },
        { etiqueta: 'Rol',                   valor: datos.rol === 'estudiante' ? 'Comunidad Estudiantil' : 'Personal Administrativo' },
        { etiqueta: 'Código',                valor: datos.codigo },
        { etiqueta: 'ODS Vinculados',        valor: odsTexto },
        { etiqueta: 'ID(s) de Reserva',      valor: idsReservas.join(', ') }
      ],
      mensaje: 'Tu solicitud ha sido recibida y está siendo revisada por el equipo de administración de CUCEI. Recibirás una notificación cuando sea aprobada o rechazada.'
    });

    MailApp.sendEmail({
      to:       datos.correo,
      subject:  asunto,
      htmlBody: cuerpoHtml
    });

  } catch (error) {
    registrarLog_(datos.correo, 'ERROR_CORREO_CONFIRMACION', error.toString());
    // No lanzar el error para no bloquear el flujo principal
  }
}

/**
 * Envía notificación al usuario cuando un admin cambia el estado de su reserva.
 * @param {string} correoUsuario - Correo del usuario
 * @param {string} idReserva - ID de la reserva
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Array} filaReserva - Datos de la fila de la reserva
 * @private
 */

/**
 * Envía notificación al usuario cuando un admin cambia el estado de su reserva.
 * @param {string} correoUsuario - Correo del usuario
 * @param {string} idReserva - ID de la reserva
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Array} filaReserva - Datos de la fila de la reserva
 * @private
 */
function enviarNotificacionCambioEstado_(correoUsuario, idReserva, nuevoEstado, filaReserva) {
  try {
    const [, , fecha, horaInicio, horaFin, , coworking, nombreCompleto, , , , , actividad] = filaReserva;

    const esAprobada = nuevoEstado === CONFIG.ESTADOS.ACEPTADA;
    const asunto = esAprobada
      ? `✅ ¡Tu reserva fue APROBADA! – ${coworking} | CUCEI`
      : `❌ Tu reserva fue rechazada – ${coworking} | CUCEI`;

    const primerNombre = String(nombreCompleto).split(' ')[0] || 'usuario';
    const fechaStr = fecha instanceof Date
      ? Utilities.formatDate(fecha, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'dd/MM/yyyy')
      : String(fecha);

    // NUEVO: Usar el formateador seguro para extraer la hora correctamente
    const hiStr = formatearHoraSegura_(horaInicio);
    const hfStr = formatearHoraSegura_(horaFin);

    const cuerpoHtml = generarPlantillaCorreo_({
      titulo:      esAprobada ? '¡Reserva Aprobada!' : 'Reserva Rechazada',
      subtitulo:   esAprobada
                     ? 'Tu espacio ha sido confirmado. ¡Hasta pronto!'
                     : 'Lamentablemente tu solicitud no fue aprobada.',
      nombreUsuario: primerNombre,
      estado:      nuevoEstado,
      estadoColor: esAprobada ? '#10b981' : '#ef4444',
      detalles: [
        { etiqueta: 'ID de Reserva',  valor: idReserva },
        { etiqueta: 'Espacio / Aula', valor: String(coworking) },
        { etiqueta: 'Actividad',      valor: String(actividad) },
        { etiqueta: 'Fecha',          valor: fechaStr },
        // MODIFICADO: Aplicar las horas formateadas en lugar de substring
        { etiqueta: 'Horario',        valor: `${hiStr} – ${hfStr} hrs` }
      ],
      mensaje: esAprobada
        ? 'Recuerda llegar puntualmente y respetar las normas del espacio de coworking.'
        : 'Si tienes dudas sobre el motivo del rechazo, por favor contacta a la administración de CUCEI.'
    });

    MailApp.sendEmail({
      to:       correoUsuario,
      subject:  asunto,
      htmlBody: cuerpoHtml
    });

  } catch (error) {
    registrarLog_(correoUsuario, 'ERROR_NOTIFICACION_ESTADO', error.toString());
  }
}

/**
 * Genera la plantilla HTML para correos electrónicos.
 * Diseño profesional, minimalista con identidad CUCEI.
 * @param {Object} opciones - Opciones de la plantilla
 * @returns {string} HTML del correo
 * @private
 */
function generarPlantillaCorreo_(opciones) {
  const filasDetalles = opciones.detalles.map(d => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
        <strong style="color: #64748b; font-size: 13px;">${d.etiqueta}</strong><br>
        <span style="color: #0f172a; font-size: 15px;">${d.valor}</span>
      </td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${opciones.titulo}</title>
  </head>
  <body style="margin: 0; padding: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc;">

    <table width="100%" max-width="600" align="center" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">

      <!-- Header -->
      <tr>
        <td style="background-color: #002f5c; padding: 30px 20px; text-align: center;">
          <table width="100%">
            <tr>
              <td align="center">
                <span style="display: block; color: #bae6fd; font-size: 12px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">UdeG</span>
                <span style="display: block; color: #ffffff; font-size: 28px; font-weight: 900; margin-top: 4px;">CUCEI</span>
                <span style="display: block; color: #93c5fd; font-size: 13px; margin-top: 4px;">Red de Espacios de Colaboración</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Hero Section -->
      <tr>
        <td style="padding: 40px 30px; text-align: center; border-bottom: 1px solid #f1f5f9;">
          <div style="display: inline-block; padding: 6px 16px; border-radius: 20px; background-color: ${opciones.estadoColor}15; color: ${opciones.estadoColor}; font-size: 12px; font-weight: bold; margin-bottom: 16px;">
            ${opciones.estado.toUpperCase()}
          </div>
          <h1 style="margin: 0 0 10px 0; color: #0f172a; font-size: 24px;">${opciones.titulo}</h1>
          <p style="margin: 0; color: #64748b; font-size: 16px;">${opciones.subtitulo}</p>
        </td>
      </tr>

      <!-- Main Content -->
      <tr>
        <td style="padding: 30px;">
          <p style="margin: 0 0 20px 0; color: #334155; font-size: 16px; line-height: 1.6;">
            <strong>Hola, ${opciones.nombreUsuario},</strong><br>
            ${opciones.mensaje}
          </p>

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px;">
            <h3 style="margin: 0 0 15px 0; color: #0f172a; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Detalles de la Solicitud</h3>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${filasDetalles}
            </table>
          </div>
        </td>
      </tr>

      <!-- Footer Info -->
      <tr>
        <td style="padding: 0 30px 30px 30px;">
          <table width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px;">
            <tr>
              <td style="color: #166534; font-size: 13px; line-height: 1.5; text-align: center;">
                ℹ️ Importante: Este correo es informativo. <br>
                Para cualquier consulta, comunícate directamente con la <br>
                administración de CUCEI.
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer Legal -->
      <tr>
        <td style="background-color: #f1f5f9; padding: 20px; text-align: center;">
          <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">
            © ${new Date().getFullYear()} Coordinación de Ingeniería en Computación – CUCEI<br>
            Universidad de Guadalajara · Este correo fue generado automáticamente
          </p>
        </td>
      </tr>
    </table>

  </body>
  </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: LOGS Y AUDITORÍA
// ─────────────────────────────────────────────────────────────

/**
 * Registra una acción en la hoja de logs para auditoría.
 * @param {string} usuario - Correo o identificador del usuario
 * @param {string} accion - Tipo de acción realizada
 * @param {string} detalles - Descripción detallada de la acción
 * @private
 */
function registrarLog_(usuario, accion, detalles) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLogs = obtenerOCrearHoja_(ss, CONFIG.SHEET_LOGS);

    sheetLogs.appendRow([
      new Date(),                             // A: Timestamp
      String(usuario || 'SISTEMA'),           // B: Usuario
      String(accion || 'ACCION'),             // C: Accion
      String(detalles || '').substring(0, 500) // D: Detalles (máx 500 chars)
    ]);
  } catch (e) {
    // Silenciar errores de logging para no afectar el flujo principal
    console.error('Error al escribir log:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: INICIALIZACIÓN DE HOJAS
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa todas las hojas necesarias del sistema si no existen.
 * Se llama automáticamente en doGet().
 * @private
 */
function inicializarHojas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Hoja: usuarios
  const hUsuarios = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
  if (hUsuarios.getLastRow() === 0) {
    hUsuarios.appendRow(['ID', 'Correo', 'Nombre', 'Rol', 'Fecha_Registro']);
    hUsuarios.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#002f5c').setFontColor('#ffffff');
  }

  // Hoja: capacidad (Reservaciones)
  const hReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
  if (hReservas.getLastRow() === 0) {
    hReservas.appendRow([
      'ID_Reserva', 'Correo', 'Fecha', 'Hora_Inicio', 'Hora_Fin',
      'Estado', 'Espacio_Aula', 'Nombre_Completo', 'Codigo',
      'Telefono', 'Extension', 'Rol', 'Actividad', 'Descripcion',
      'ODS', 'Fecha_Registro'
    ]);
    hReservas.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#002f5c').setFontColor('#ffffff');
  }

  // Hoja: logs
  const hLogs = obtenerOCrearHoja_(ss, CONFIG.SHEET_LOGS);
  if (hLogs.getLastRow() === 0) {
    hLogs.appendRow(['Timestamp', 'Usuario', 'Accion', 'Detalles']);
    hLogs.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#002f5c').setFontColor('#ffffff');
  }
}

/**
 * Registra o actualiza un usuario en la hoja 'usuarios'.
 * @param {string} correo - Correo del usuario
 * @param {string} rol - Rol asignado
 * @private
 */
function registrarOActualizarUsuario_(correo, rol) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const ultimaFila = sheet.getLastRow();

    if (ultimaFila > 1) {
      const datos = sheet.getRange(2, 2, ultimaFila - 1, 1).getValues();
      for (let i = 0; i < datos.length; i++) {
        if (String(datos[i][0]).toLowerCase() === correo.toLowerCase()) {
          // Usuario ya existe, no hacer nada
          return;
        }
      }
    }

    // Nuevo usuario: agregar registro
    const nuevoId = `USR-${Date.now()}`;
    sheet.appendRow([nuevoId, correo, '', rol, new Date()]);

  } catch (e) {
    console.error('Error al registrar usuario:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// MÓDULO: UTILIDADES
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene una hoja por nombre o la crea si no existe.
 * @param {Spreadsheet} ss - Spreadsheet activo
 * @param {string} nombre - Nombre de la hoja
 * @returns {Sheet} La hoja encontrada o creada
 * @private
 */
function obtenerOCrearHoja_(ss, nombre) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
  }
  return sheet;
}

/**
 * Genera un ID único para una reserva.
 * Formato: RES-YYYYMMDD-RANDOM
 * @returns {string} ID único
 * @private
 */
function generarIdReserva_() {
  const fecha = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `RES-${fecha}-${random}`;
}

/**
 * Convierte una cadena de hora HH:MM a minutos totales.
 * @param {string} horaStr - Hora en formato HH:MM
 * @returns {number} Minutos totales
 * @private
 */
function convertirHoraAMinutos_(horaStr) {
  const partes = String(horaStr).split(':');
  return parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
}

/**
 * Convierte minutos totales a cadena de hora HH:MM.
 * @param {number} totalMinutos
 * @returns {string} Hora en formato HH:MM
 * @private
 */
function convertirMinutosAHoraString_(totalMinutos) {
  const hrs = Math.floor(totalMinutos / 60);
  const min = totalMinutos % 60;
  return `${String(hrs).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Formatea una fecha YYYY-MM-DD a formato legible DD/MM/YYYY.
 * @param {string} fechaStr - Fecha en formato ISO
 * @returns {string} Fecha formateada
 * @private
 */
function formatearFechaLegible_(fechaStr) {
  const partes = fechaStr.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fechaStr;
}

/**
 * Valida los datos mínimos requeridos para crear una reserva.
 * @param {Object} datos - Datos del formulario
 * @returns {Object} { valido: boolean, mensaje: string }
 * @private
 */
function validarDatosReserva_(datos) {
  const camposRequeridos = ['correo', 'nombres', 'apellidoPaterno', 'coworking', 'horaEntrada', 'horaSalida'];

  for (const campo of camposRequeridos) {
    if (!datos[campo] || String(datos[campo]).trim() === '') {
      return { valido: false, mensaje: `El campo "${campo}" es requerido y está vacío.` };
    }
  }

  if (!datos.fechas || datos.fechas.length === 0) {
    return { valido: false, mensaje: 'Debes seleccionar al menos una fecha.' };
  }

  // Validar que horaFin sea mayor que horaInicio
  if (convertirHoraAMinutos_(datos.horaEntrada) >= convertirHoraAMinutos_(datos.horaSalida)) {
    return { valido: false, mensaje: 'La hora de salida debe ser posterior a la hora de entrada.' };
  }

  return { valido: true };
}

// ─────────────────────────────────────────────────────────────
// COMPATIBILIDAD LEGACY (Sistema anterior)
// ─────────────────────────────────────────────────────────────

/**
 * Mantiene compatibilidad con el sistema legacy (hoja Registros + Google Calendar).
 * @param {Object} datos - Datos de la reserva
 * @param {string} nombreCompleto - Nombre completo
 * @param {string} odsTexto - ODS seleccionados
 * @private
 */
function procesarRegistroLegacy_(datos, nombreCompleto, odsTexto) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRegistros = ss.getSheetByName('Registros');
  if (!sheetRegistros) return; // Si no existe la hoja legacy, ignorar

  const minutosInicio = convertirHoraAMinutos_(datos.horaEntrada);
  const minutosFin    = convertirHoraAMinutos_(datos.horaSalida);
  const horasSlots    = [];

  for (let m = minutosInicio; m < minutosFin; m += 30) {
    horasSlots.push(convertirMinutosAHoraString_(m));
  }

  for (const fechaSol of datos.fechas) {
    let eventoId = '';
    try {
      const cal = CalendarApp.getDefaultCalendar();
      const fechaHoraInicio = new Date(`${fechaSol}T${datos.horaEntrada}:00`);
      const fechaHoraFin    = new Date(`${fechaSol}T${datos.horaSalida}:00`);
      const tituloEvento = `Reserva [${datos.actividad}] ${datos.coworking} - ${nombreCompleto}`;
      const evento = cal.createEvent(tituloEvento, fechaHoraInicio, fechaHoraFin, {
        description: `Usuario: ${nombreCompleto}\nCorreo: ${datos.correo}\nODS: ${odsTexto}`,
        guests:      datos.correo,
        sendInvites: true
      });
      eventoId = evento.getId();
    } catch (calError) {
      registrarLog_(datos.correo, 'ADVERTENCIA_CALENDAR', calError.toString());
    }

    // Insertar en la hoja "Registros" (legacy) dividida en slots
    for (const slot of horasSlots) {
      sheetRegistros.appendRow([
        new Date(),                 // Marca temporal
        datos.correo,               // Dirección de correo electrónico
        datos.nombres,              // Nombres
        datos.apellidoPaterno,      // Apellido paterno
        datos.apellidoMaterno,      // Apellido materno
        datos.codigo,               // Código de estudiante
        datos.telefono,             // Número de teléfono
        datos.rol,                  // ¿Eres estudiante o trabajador?
        datos.extension,            // Extensión
        datos.actividad,            // Nombre del proyecto o actividad
        datos.descripcionActividad, // Descripción
        datos.coworking,            // Coworking seleccionado
        fechaSol,                   // Fecha
        slot,                       // Hora de entrada (slot)
        odsTexto,                   // ODS
        eventoId                    // ID Evento Calendar
      ]);
    }
  }
}

/**
 * Crea un evento en Google Calendar cuando se aprueba una reserva e invita al usuario.
 * @param {Array} filaReserva - Datos de la fila completa de la reserva
 * @private
 */

/**
 * Crea un evento en Google Calendar cuando se aprueba una reserva e invita al usuario.
 * @param {Array} filaReserva - Datos de la fila completa de la reserva
 * @private
 */
function crearEventoCalendario_(filaReserva) {
  try {
    // Desestructurar las columnas importantes (basado en el orden de la hoja 'capacidad')
    const [, correo, fecha, horaInicio, horaFin, , coworking, nombreCompleto, , , , , actividad, , ods] = filaReserva;

    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    let fechaStr = '';

    // Extraer la fecha de forma segura
    if (fecha instanceof Date) {
      fechaStr = Utilities.formatDate(fecha, tz, 'yyyy-MM-dd');
    } else {
      fechaStr = String(fecha).trim();
      // Si el texto viene como DD/MM/YYYY, convertirlo a YYYY-MM-DD para Calendar
      if (fechaStr.includes('/') && fechaStr.split('/')[0].length === 2) {
         const partes = fechaStr.split('/');
         fechaStr = `${partes[2]}-${partes[1]}-${partes[0]}`;
      }
    }

    // Extraer horas en formato HH:mm de forma segura (ej: "14:30")
    const hiStr = formatearHoraSegura_(horaInicio);
    const hfStr = formatearHoraSegura_(horaFin);

    // Formato requerido por Date nativo de Apps Script: YYYY-MM-DDTHH:mm:00
    const fechaHoraInicio = new Date(`${fechaStr}T${hiStr}:00`);
    const fechaHoraFin    = new Date(`${fechaStr}T${hfStr}:00`);

    // Comprobación de seguridad para evitar crasheos si la fecha es inválida
    if (isNaN(fechaHoraInicio.getTime()) || isNaN(fechaHoraFin.getTime())) {
        registrarLog_('ERROR_CALENDAR', 'FECHA_INVALIDA', `Inicio: ${fechaStr}T${hiStr}:00, Fin: ${fechaStr}T${hfStr}:00`);
        return;
    }

    const cal = CalendarApp.getDefaultCalendar();
    const tituloEvento = `Reserva confirmada: ${coworking} - ${nombreCompleto}`;
    const descripcionEvento = `Actividad: ${actividad}\nODS: ${ods}\nSolicitante: ${nombreCompleto}\n\nReserva gestionada por CUCEI Coworking System.`;

    cal.createEvent(tituloEvento, fechaHoraInicio, fechaHoraFin, {
      description: descripcionEvento,
      guests: String(correo),
      sendInvites: true
    });

    registrarLog_('SISTEMA', 'CALENDAR_CREADO', `Evento en ${coworking} para ${correo}`);
  } catch (error) {
    registrarLog_('ERROR', 'crearEventoCalendario', error.toString());
  }
}


/**
 * Extrae de forma segura la hora en formato HH:mm 24hrs
 * resolviendo el problema de conversión automática de Google Sheets (Sat Dec 30 1899).
 */
function formatearHoraSegura_(valor) {
  if (!valor) return "00:00";

  // Si Google Sheets lo convirtió a un objeto Date
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'HH:mm');
  }

  const str = String(valor).trim();

  // Si es un texto tipo "08:00 AM" o "02:30 PM"
  const match = str.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Fallback si no tiene AM/PM
  return str.substring(0, 5);
}
