/**
 * ============================================================
 * CUCEI COWORKING SYSTEM - Backend Principal v2.0
 * Code.gs
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN GLOBAL
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  SHEET_USUARIOS:  'usuarios',
  SHEET_RESERVAS:  'capacidad',
  SHEET_LOGS:      'logs',
  SHEET_REGISTROS: 'Registros',

  DOMINIOS_ALUMNO:  ['@alumnos.udg.mx'],
  DOMINIOS_MAESTRO: ['@academicos.udg.mx', '@cucei.udg.mx', '@administrativos.udg.mx'],

  ESTADOS: {
    PENDIENTE: 'Pendiente',
    ACEPTADA:  'Aceptada',
    RECHAZADA: 'Rechazada',
    DEVUELTA:  'Devuelta'
  },

  HORA_APERTURA: '08:00',
  HORA_CIERRE:   '20:00',

  // ── Configuración de Calendario y Notificaciones ──
  CALENDAR_ID:                 '', // Deja vacío para usar el calendario por defecto, o pon el ID de un calendario compartido
  CORREO_ADMIN_NOTIFICACIONES: 'martha.angulo8828@alumnos.udg.mx', // Cambia por tu correo
  CORREO_COORDINADOR_1:        'alan.morales9272@alumnos.udg.mx', // Cambia por tu correo
  CORREO_COORDINADOR_2:        'kevinhalocod@gmail.com', // Cambia por tu correo

  // ── Carpeta de Google Drive para archivos adjuntos ──
  DRIVE_FOLDER_NAME: 'CoworkingCUCEI_Archivos',

  // ── Branding para correos ──
  LOGO_URL:       'https://www.udg.mx/sites/default/files/logo-udg.png',
  COLOR_PRIMARIO: '#002f5c',
  COLOR_ACENTO:   '#eaaa00',

  // ── Columnas de la hoja de reservas (índice base 0) ──
  COL: {
    ID_RESERVA:        0,
    CORREO:            1,
    FECHA:             2,
    HORA_INICIO:       3,
    HORA_FIN:          4,
    ESTADO:            5,
    COWORKING:         6,
    NOMBRE_COMPLETO:   7,
    CODIGO:            8,
    TELEFONO:          9,
    EXTENSION:         10,
    ROL:               11,
    ACTIVIDAD:         12,
    DESCRIPCION:       13,
    ODS:               14,
    FECHA_REGISTRO:    15,
    MOTIVO_RECHAZO:    16,
    ARCHIVOS_URLS:     17,
    TIPO_ACTIVIDAD:    18,
    CORREO_RESPONSABLE:19,
    ID_ORIGINAL:       20,
    FECHA_ACTUALIZACION: 21,
    ID_CALENDAR:       22,
    NOMBRE_ENCARGADO:  23,
    APELLIDOS_ENCARGADO: 24,
    CORREO_ENCARGADO:  25
  }
};

// ─────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA
// ─────────────────────────────────────────────────────────────
function doGet() {
  try {
    inicializarHojas_();
    asegurarHeadersReservas_();
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Coworkings CUCEI - Reservas')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch (error) {
    registrarLog_('SISTEMA', 'ERROR_DOGet', error.toString());
    return HtmlService.createHtmlOutput('Error al cargar la aplicación: ' + error.toString());
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN Y CONFIGURACIÓN DE HOJAS
// ─────────────────────────────────────────────────────────────
function inicializarHojas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Hoja Usuarios
  const hU = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
  if (hU.getLastRow() === 0) {
    // CAMBIAR LA CABECERA PARA AGREGAR 'Nombres' y 'Apellidos'
    hU.appendRow(['ID','Correo','Codigo','PasswordHash','Rol','Nombre','Fecha_Registro', 'Nombres', 'Apellidos']);
    hU.getRange(1,1,1,9).setFontWeight('bold').setBackground(CONFIG.COLOR_PRIMARIO).setFontColor('#ffffff');
  }

  // Hoja Reservas (23 columnas)
  const hR = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
  if (hR.getLastRow() === 0) {
    hR.appendRow([
      'ID_Reserva','Correo','Fecha','Hora_Inicio','Hora_Fin','Estado',
      'Espacio_Aula','Nombre_Completo','Codigo','Telefono','Extension',
      'Rol','Actividad','Descripcion','ODS','Fecha_Registro',
      'Motivo_Rechazo','Archivos_URLs','Tipo_Actividad','Correo_Responsable',
      'ID_Original', 'Fecha_Actualizacion', 'ID_Calendar',
       'Nombre_Encargado', 'Apellidos_Encargado', 'Correo_Encargado'
    ]);
    hR.getRange(1,1,1,26).setFontWeight('bold').setBackground(CONFIG.COLOR_PRIMARIO).setFontColor('#ffffff');
  }

  // Hoja Logs
  const hL = obtenerOCrearHoja_(ss, CONFIG.SHEET_LOGS);
  if (hL.getLastRow() === 0) {
    hL.appendRow(['Timestamp','Usuario','Accion','Detalles']);
    hL.getRange(1,1,1,4).setFontWeight('bold').setBackground(CONFIG.COLOR_PRIMARIO).setFontColor('#ffffff');
  }

  // Hoja Histórica (Registros)
  if (!ss.getSheetByName(CONFIG.SHEET_REGISTROS)) {
    ss.insertSheet(CONFIG.SHEET_REGISTROS);
  }
}

function asegurarHeadersReservas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);

  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const nuevosHeaders = [
    'Motivo_Rechazo',
    'Archivos_URLs',
    'Tipo_Actividad',
    'Correo_Responsable',
    'ID_Original',
    'Fecha_Actualizacion',
    'ID_Calendar',
    'Nombre_Encargado',
    'Apellidos_Encargado',
    'Correo_Encargado'
  ];

  for (let i = 0; i < nuevosHeaders.length; i++) {
    const nombre = nuevosHeaders[i];
    if (!headers.includes(nombre)) {
      const nuevaColumna = sheet.getLastColumn() + 1;
      sheet.getRange(1, nuevaColumna).setValue(nombre);
    }
  }

  const finalLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, finalLastCol)
    .setFontWeight('bold')
    .setBackground(CONFIG.COLOR_PRIMARIO)
    .setFontColor('#ffffff');
}

function obtenerOCrearHoja_(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────
function hashPassword_(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let v = rawHash[i];
    if (v < 0) v += 256;
    txtHash += (v < 16 ? '0' : '') + v.toString(16);
  }
  return txtHash;
}

function determinarRolUsuario_(correo) {
  const c = correo.toLowerCase();
  if (CONFIG.DOMINIOS_MAESTRO.some(d => c.endsWith(d))) return 'maestro';
  if (CONFIG.DOMINIOS_ALUMNO.some(d => c.endsWith(d)))  return 'alumno';
  return 'denegado';
}

function registrarUsuarioCustom(correo, codigo, contrasenia, nombres, apellidos) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data  = sheet.getDataRange().getValues();
    const cL    = String(correo).trim().toLowerCase();
    const coL   = String(codigo).trim().toLowerCase();

    const rol = determinarRolUsuario_(cL);
    if (rol === 'denegado') {
      return { exito: false, mensaje: 'El correo no pertenece a un dominio institucional autorizado.' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase() === cL)  return { exito: false, mensaje: 'El correo ya está registrado.' };
      if (String(data[i][2]).toLowerCase() === coL) return { exito: false, mensaje: 'El código ya está registrado.' };
    }

    const passHash = hashPassword_(contrasenia);
    const nuevoId  = `USR-${Date.now()}`;
    const nombreCompleto = `${nombres} ${apellidos}`.trim();
    
    // Aquí agregamos los nombres y apellidos al final del arreglo
    sheet.appendRow([nuevoId, cL, coL, passHash, rol, nombreCompleto, new Date(), nombres, apellidos]);
    registrarLog_(cL, 'REGISTRO_USUARIO', `Rol asignado: ${rol}`);

    return { exito: true, mensaje: 'Registro exitoso.' };
  } catch (e) {
    return { exito: false, mensaje: 'Error interno: ' + e.toString() };
  }
}

function loginUsuarioCustom(identificador, contrasenia) {
  try {
    const ss       = SpreadsheetApp.getActiveSpreadsheet();
    const sheet    = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data     = sheet.getDataRange().getValues();
    const idLower  = String(identificador).trim().toLowerCase();
    const passHash = hashPassword_(contrasenia);

    for (let i = 1; i < data.length; i++) {
      const correo = String(data[i][1]).toLowerCase();
      const codigo = String(data[i][2]).toLowerCase();
      const hash   = String(data[i][3]);

      if (correo === idLower || codigo === idLower) {
       if (hash === passHash) {
          // Lógica para usuarios antiguos vs nuevos
          let nombreComp = String(data[i][5] || '');
          let nomb = data[i][7] || '';
          let apel = data[i][8] || '';
          
          if (!nomb && nombreComp) {
            let partes = nombreComp.split(' ');
            nomb = partes[0] || '';
            apel = partes.slice(1).join(' ') || '';
          }

          return {
            exito: true,
            usuario: {
              accesoConcedido: true,
              correo:          data[i][1],
              codigo:          data[i][2],
              rol:             data[i][4],
              nombre:          nombreComp,
              nombres:         nomb,
              apellidos:       apel
            }
          };
        }
        return { exito: false, mensaje: 'Contraseña incorrecta.' };
      }
    }
    return { exito: false, mensaje: 'Usuario no encontrado.' };
  } catch (e) {
    return { exito: false, mensaje: 'Error interno: ' + e.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// GESTIÓN DE USUARIOS Y ROLES
// ─────────────────────────────────────────────────────────────
function obtenerListaUsuarios(adminCorreo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data  = sheet.getDataRange().getValues();
    const admins = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      // EXTRAEMOS SOLO A LOS ADMINISTRADORES PARA NO SATURAR EL FRONTEND
      if (String(data[i][4]).toLowerCase() === 'admin') {
        admins.push({
          id:     data[i][0],
          correo: data[i][1],
          codigo: data[i][2],
          rol:    data[i][4]
        });
      }
    }
    return { exito: true, usuarios: admins };
  } catch (e) {
    return { exito: false, mensaje: e.toString() };
  }
}

function buscarUsuariosSistema(busqueda, adminCorreo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data  = sheet.getDataRange().getValues();
    const resultados = [];
    const q = String(busqueda).trim().toLowerCase();

    if (!q) return { exito: true, usuarios: [] };

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      const correo = String(data[i][1]).toLowerCase();
      const codigo = String(data[i][2]).toLowerCase();
      
      if (correo.includes(q) || codigo.includes(q)) {
        resultados.push({
          id:     data[i][0],
          correo: data[i][1],
          codigo: data[i][2],
          rol:    data[i][4]
        });
      }
      // Candado de optimización: Solo devolvemos los primeros 20 resultados
      if (resultados.length >= 20) break; 
    }
    return { exito: true, usuarios: resultados };
  } catch (e) {
    return { exito: false, mensaje: e.toString() };
  }
}

function actualizarRolUsuario(idUsuario, nuevoRol, adminCorreo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idUsuario)) {
        sheet.getRange(i + 1, 5).setValue(nuevoRol);
        registrarLog_(adminCorreo, 'CAMBIO_ROL_USUARIO', `User ID: ${idUsuario} → ${nuevoRol}`);
        return { exito: true, mensaje: 'Rol actualizado exitosamente.' };
      }
    }
    return { exito: false, mensaje: 'Usuario no encontrado.' };
  } catch (e) {
    return { exito: false, mensaje: e.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// RESERVAS E INSERCIÓN DE DATOS
// ─────────────────────────────────────────────────────────────
function registrarReserva(datos, sesionCorreo) {
  try {
    const validacion = validarDatosReserva_(datos);
    if (!validacion.valido) return { exito: false, mensaje: validacion.mensaje };

    const ss             = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas  = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const nombreCompleto = `${datos.nombres} ${datos.apellidoPaterno} ${datos.apellidoMaterno}`.trim();
    const odsTexto       = (datos.ods && datos.ods.length > 0) ? datos.ods.join(', ') : 'Ninguno seleccionado';

    const reservasCreadas = [];
    const fechasConHorario = datos.fechasConHorario || datos.fechas.map(f => ({
      fecha:       f,
      horaEntrada: datos.horaEntrada,
      horaSalida:  datos.horaSalida
    }));

    // Si es reenvío de una solicitud devuelta, se marca la anterior
    if (datos.reservaDevueltaId && datos.modoEdicion === 'S') {
      marcarReservaComoReemplazada_(sheetReservas, datos.reservaDevueltaId);
    }

    // Borrar archivos descartados en la corrección
    if (datos.archivosAEliminar && datos.archivosAEliminar.length > 0) {
      eliminarArchivosDeDrive_(datos.archivosAEliminar);
    }

    // Subir archivos nuevos a Google Drive
    let archivosNuevos = [];
    if (datos.archivos && datos.archivos.length > 0) {
      archivosNuevos = subirArchivosADrive_(datos.archivos, datos.correo);
    }
    
    // Combinar viejos conservados con los nuevos
    const archivosFinales = (datos.archivosExistentes || []).concat(archivosNuevos);
    const archivosStr = archivosFinales.length > 0 ? JSON.stringify(archivosFinales) : '';

    for (const fh of fechasConHorario) {
      const colision = verificarColision_(sheetReservas, datos.coworking, fh.fecha, fh.horaEntrada, fh.horaSalida);
      if (colision.hayColision) {
        return { exito: false, mensaje: `Conflicto de horario para el ${formatearFechaLegible_(fh.fecha)}: ${colision.mensaje}` };
      }

      const idReserva = generarIdReserva_();
      const idOriginal = datos.modoEdicion === 'S' && datos.idOriginal ? datos.idOriginal : idReserva;

      // Crear evento borrador en Calendar
      const idCalendar = crearEventoBorrador_(datos, fh, idReserva);

      sheetReservas.appendRow([
        idReserva,                        // 0  ID_Reserva
        datos.correo,                     // 1  Correo
        fh.fecha,                         // 2  Fecha
        fh.horaEntrada,                   // 3  Hora_Inicio
        fh.horaSalida,                    // 4  Hora_Fin
        CONFIG.ESTADOS.PENDIENTE,         // 5  Estado
        datos.coworking,                  // 6  Espacio
        nombreCompleto,                   // 7  Nombre_Completo
        datos.codigo,                     // 8  Codigo
        datos.telefono,                   // 9  Telefono
        datos.extension || 'N/A',         // 10 Extension
        datos.rol,                        // 11 Rol
        datos.actividad,                  // 12 Actividad
        datos.descripcionActividad,       // 13 Descripcion
        odsTexto,                         // 14 ODS
        new Date(),                       // 15 Fecha_Registro
        '',                               // 16 Motivo_Rechazo
        archivosStr,                      // 17 Archivos_URLs
        datos.tipoActividad || '',        // 18 Tipo_Actividad
        datos.correoResponsable || '',    // 19 Correo_Responsable
        idOriginal,                       // 20 ID_Original
        new Date(),                       // 21 Fecha_Actualizacion
        idCalendar,                       // 22 ID_Calendar (NUEVO)
        datos.nombreEncargado || '',       // 23 Nombre_Encargado
        datos.apellidosEncargado || '',    // 24 Apellidos_Encargado
        datos.correoEncargado || ''        // 25 Correo_Encargado
      ]);
      reservasCreadas.push(idReserva);
    }

    registrarLog_(sesionCorreo, 'RESERVA_CREADA', `IDs: ${reservasCreadas.join(', ')} | Coworking: ${datos.coworking}`);

    enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, reservasCreadas, fechasConHorario);
    notificarNuevaReservaAdmin_(datos, nombreCompleto, reservasCreadas, fechasConHorario);

    try { procesarRegistroLegacy_(datos, nombreCompleto, odsTexto, fechasConHorario); } catch (e) { /* Silencioso */ }

    return {
      exito:   true,
      mensaje: `¡Reserva procesada con éxito! ID(s): ${reservasCreadas.join(', ')}. Estado: En espera.`
    };
  } catch (error) {
    registrarLog_('SISTEMA', 'ERROR_RESERVA', error.toString());
    return { exito: false, mensaje: 'Error al procesar reserva: ' + error.toString() };
  }
}

function reenviarReservaCorregida(datos, sesionCorreo) {
  // Simplemente redirige a la función principal que ya contempla 'modoEdicion'
  return registrarReserva(datos, sesionCorreo);
}

function marcarReservaComoReemplazada_(sheet, idReservaDevuelta) {
  try {
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila <= 1) return;
    const datos = sheet.getRange(2, 1, ultimaFila - 1, 1).getValues();
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === String(idReservaDevuelta).trim()) {
        sheet.getRange(i + 2, CONFIG.COL.ESTADO + 1).setValue('Reemplazada');
        break;
      }
    }
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_MARCAR_REEMPLAZADA', e.toString());
  }
}

function verificarColision_(sheet, coworking, fecha, horaInicio, horaFin) {
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila <= 1) return { hayColision: false };

  const registros = sheet.getRange(2, 1, ultimaFila - 1, 7).getValues();
  const tz        = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const inicioNuevo = convertirHoraAMinutos_(horaInicio);
  const finNuevo    = convertirHoraAMinutos_(horaFin);

  for (const fila of registros) {
    const [, , fechaEx, hiEx, hfEx, estadoEx, cwEx] = fila;

    if (estadoEx !== CONFIG.ESTADOS.PENDIENTE && estadoEx !== CONFIG.ESTADOS.ACEPTADA) continue;
    if (String(cwEx).trim().toLowerCase() !== coworking.trim().toLowerCase()) continue;

    let fechaNorm;
    try {
      fechaNorm = fechaEx instanceof Date ? Utilities.formatDate(fechaEx, tz, 'yyyy-MM-dd') : String(fechaEx).trim();
    } catch (e) { continue; }

    if (fechaNorm !== fecha) continue;

    const inicioEx = convertirHoraAMinutos_(String(hiEx).substring(0, 5));
    const finEx    = convertirHoraAMinutos_(String(hfEx).substring(0, 5));

    if (inicioNuevo < finEx && finNuevo > inicioEx) {
      return { hayColision: true, mensaje: 'Superposición de horario con otra reserva existente.' };
    }
  }
  return { hayColision: false };
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD ADMIN Y CONSULTAS
// ─────────────────────────────────────────────────────────────
function obtenerDashboardAdmin(adminCorreo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss            = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila    = sheetReservas.getLastRow();

    if (ultimaFila <= 1) {
      return {
        exito: true, reservas: [],
        metricas: { total: 0, pendientes: 0, aceptadas: 0, rechazadas: 0 },
        graficaEstados:  { labels: ['Pendiente','Aceptada','Rechazada'], datos: [0,0,0] },
        graficaEspacios: { labels: [], datos: [] }
      };
    }

    const numCols = CONFIG.COL.CORREO_ENCARGADO + 1; // Leemos todas las columnas
    const datos   = sheetReservas.getRange(2, 1, ultimaFila - 1, numCols).getValues();
    const tz      = ss.getSpreadsheetTimeZone();
    const reservas = [];
    let pendientes = 0, aceptadas = 0, rechazadas = 0;
    const espaciosConteo = {};

    for (const fila of datos) {
      const idReserva = fila[CONFIG.COL.ID_RESERVA];
      if (!idReserva) continue;

      const estado    = String(fila[CONFIG.COL.ESTADO]);
      const coworking = String(fila[CONFIG.COL.COWORKING]).trim();
      let fechaStr    = fila[CONFIG.COL.FECHA] instanceof Date
        ? Utilities.formatDate(fila[CONFIG.COL.FECHA], tz, 'yyyy-MM-dd')
        : String(fila[CONFIG.COL.FECHA]).trim();

      switch (estado) {
        case CONFIG.ESTADOS.PENDIENTE:  pendientes++;  break;
        case CONFIG.ESTADOS.ACEPTADA:   aceptadas++;   break;
        case CONFIG.ESTADOS.RECHAZADA:  rechazadas++;  break;
      }

      espaciosConteo[coworking] = (espaciosConteo[coworking] || 0) + 1;

      let archivosUrls = [];
      try {
        const archStr = String(fila[CONFIG.COL.ARCHIVOS_URLS] || '');
        if (archStr && archStr !== '') archivosUrls = JSON.parse(archStr);
      } catch (e) { /* ignore */ }

      reservas.push({
        idReserva:         String(idReserva),
        correo:            String(fila[CONFIG.COL.CORREO]),
        fecha:             fechaStr,
        horaInicio:        formatearHoraSegura_(fila[CONFIG.COL.HORA_INICIO]),
        horaFin:           formatearHoraSegura_(fila[CONFIG.COL.HORA_FIN]),
        estado:            estado,
        coworking:         coworking,
        nombreCompleto:    String(fila[CONFIG.COL.NOMBRE_COMPLETO]),
        codigo:            String(fila[CONFIG.COL.CODIGO]),
        telefono:          String(fila[CONFIG.COL.TELEFONO]),
        extension:         String(fila[CONFIG.COL.EXTENSION]),
        rol:               String(fila[CONFIG.COL.ROL]),
        actividad:         String(fila[CONFIG.COL.ACTIVIDAD]),
        descripcion:       String(fila[CONFIG.COL.DESCRIPCION]),
        ods:               String(fila[CONFIG.COL.ODS]),
        fechaRegistro:     fila[CONFIG.COL.FECHA_REGISTRO] instanceof Date
          ? Utilities.formatDate(fila[CONFIG.COL.FECHA_REGISTRO], tz, 'dd/MM/yyyy HH:mm')
          : String(fila[CONFIG.COL.FECHA_REGISTRO]),
        motivoRechazo:     String(fila[CONFIG.COL.MOTIVO_RECHAZO] || ''),
        archivosUrls:      archivosUrls,
        tipoActividad:     String(fila[CONFIG.COL.TIPO_ACTIVIDAD] || ''),
        correoResponsable: String(fila[CONFIG.COL.CORREO_RESPONSABLE] || ''),
        nombreEncargado: String(fila[CONFIG.COL.NOMBRE_ENCARGADO] || ''),
        apellidosEncargado: String(fila[CONFIG.COL.APELLIDOS_ENCARGADO] || ''),
        correoEncargado: String(fila[CONFIG.COL.CORREO_ENCARGADO] || ''),
        idCalendar:        String(fila[CONFIG.COL.ID_CALENDAR] || '')
      });
    } 

    reservas.sort((a, b) => {
      const p = { 'Pendiente': 0, 'Devuelta': 1, 'Aceptada': 2, 'Rechazada': 3 };
      if ((p[a.estado] ?? 4) !== (p[b.estado] ?? 4)) return (p[a.estado] ?? 4) - (p[b.estado] ?? 4);
      return b.fecha.localeCompare(a.fecha);
    });

    registrarLog_(adminCorreo, 'DASHBOARD_CONSULTADO', `Total: ${reservas.length}`);

    return {
      exito:   true,
      reservas,
      metricas: { total: reservas.length, pendientes, aceptadas, rechazadas },
      graficaEstados:  { labels: ['Pendiente', 'Aceptada', 'Rechazada'], datos:  [pendientes, aceptadas, rechazadas] },
      graficaEspacios: { labels: Object.keys(espaciosConteo), datos:  Object.values(espaciosConteo) }
    };
  } catch (error) {
    return { exito: false, mensaje: error.toString() };
  }
}

function actualizarEstadoReserva(idReserva, nuevoEstado, adminCorreo, motivoRechazo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss            = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila    = sheetReservas.getLastRow();
    if (ultimaFila <= 1) return { exito: false, mensaje: 'No hay reservas.' };

    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, CONFIG.COL.CORREO_ENCARGADO + 1).getValues();
    
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][CONFIG.COL.ID_RESERVA]).trim() !== String(idReserva).trim()) continue;

      const estadoActual = datos[i][CONFIG.COL.ESTADO];
      if (estadoActual === CONFIG.ESTADOS.ACEPTADA) {
        return { exito: false, mensaje: '🔒 Esta reserva ya fue Aceptada y no puede modificarse.' };
      }

      const fila = i + 2;

      // Actualizar estado y fecha actualización
      sheetReservas.getRange(fila, CONFIG.COL.ESTADO + 1).setValue(nuevoEstado);
      sheetReservas.getRange(fila, CONFIG.COL.FECHA_ACTUALIZACION + 1).setValue(new Date());

      // Guardar motivo
      if (motivoRechazo && (nuevoEstado === CONFIG.ESTADOS.RECHAZADA || nuevoEstado === CONFIG.ESTADOS.DEVUELTA)) {
        sheetReservas.getRange(fila, CONFIG.COL.MOTIVO_RECHAZO + 1).setValue(motivoRechazo);
      }

      registrarLog_(adminCorreo, `RESERVA_${nuevoEstado.toUpperCase()}`, `ID: ${idReserva} | Admin: ${adminCorreo}`);

      // Notificar al usuario
      const correoUsuario = String(datos[i][CONFIG.COL.CORREO]);
      enviarNotificacionCambioEstado_(correoUsuario, idReserva, nuevoEstado, datos[i], motivoRechazo);

      // FASE 2: Manejo del Calendario (Actualizar a Confirmado o Eliminar Borrador)
      const idCalendar = String(datos[i][CONFIG.COL.ID_CALENDAR] || '');

      if (nuevoEstado === CONFIG.ESTADOS.ACEPTADA) {
        confirmarEventoExistente_(idCalendar, datos[i], adminCorreo);
        // Enviar correo extra a los coordinadores con el aviso formal
        notificarAceptacionCoordinadores_(datos[i]);
      } else if (nuevoEstado === CONFIG.ESTADOS.RECHAZADA) {
        eliminarEventoBorrador_(idCalendar);
        // Borrar archivos basura de Drive
        let archivosParaBorrar = [];
        try { if (datos[i][CONFIG.COL.ARCHIVOS_URLS]) archivosParaBorrar = JSON.parse(datos[i][CONFIG.COL.ARCHIVOS_URLS]); } catch(e){}
        if (archivosParaBorrar.length > 0) eliminarArchivosDeDrive_(archivosParaBorrar);
      } else if (nuevoEstado === CONFIG.ESTADOS.DEVUELTA) {
        eliminarEventoBorrador_(idCalendar);
      }

      return { exito: true, mensaje: `✅ Reserva actualizada a "${nuevoEstado}".` };
    }
    return { exito: false, mensaje: 'Reserva no encontrada.' };
  } catch (error) {
    return { exito: false, mensaje: error.toString() };
  }
}

function buscarReservasPorCorreo(correoBusqueda, adminCorreo) {
  try {
    if (!esAdmin_(adminCorreo)) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const ss            = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila    = sheetReservas.getLastRow();
    if (ultimaFila <= 1) return { exito: true, reservas: [], mensaje: 'No hay reservas.' };

    const datos      = sheetReservas.getRange(2, 1, ultimaFila - 1, CONFIG.COL.CORREO_ENCARGADO + 1).getValues();
    const tz         = ss.getSpreadsheetTimeZone();
    const resultados = [];
    const busqueda   = correoBusqueda.trim().toLowerCase();

    for (const fila of datos) {
      if (!String(fila[1]).toLowerCase().includes(busqueda)) continue;
      let fStr = fila[2] instanceof Date ? Utilities.formatDate(fila[2], tz, 'yyyy-MM-dd') : String(fila[2]).trim();
      resultados.push({
        idReserva:  String(fila[0]),
        correo:     String(fila[1]),
        fecha:      fStr,
        horaInicio: formatearHoraSegura_(fila[3]),
        horaFin:    formatearHoraSegura_(fila[4]),
        estado:     String(fila[5]),
        coworking:  String(fila[6])
      });
    }

    registrarLog_(adminCorreo, 'BUSQUEDA_REALIZADA', `"${correoBusqueda}"`);
    return {
      exito:    true,
      reservas: resultados,
      mensaje:  resultados.length > 0 ? `Se encontraron ${resultados.length} reserva(s).` : 'No se encontraron reservas para ese correo.'
    };
  } catch (error) {
    return { exito: false, mensaje: error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// RESERVAS DEL USUARIO (Alumno / Maestro)
// ─────────────────────────────────────────────────────────────
function obtenerMisReservas(correoUsuario) {
  try {
    const ss            = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila    = sheetReservas.getLastRow();
    if (ultimaFila <= 1) return { exito: true, reservas: [] };

    const datos    = sheetReservas.getRange(2, 1, ultimaFila - 1, CONFIG.COL.CORREO_ENCARGADO + 1).getValues();
    const tz       = ss.getSpreadsheetTimeZone();
    const reservas = [];
    const correo = String(correoUsuario || '').trim().toLowerCase();

    for (const fila of datos) {
      if (String(fila[CONFIG.COL.CORREO]).trim().toLowerCase() !== correo) continue;
      if (!fila[CONFIG.COL.ID_RESERVA]) continue;

      const fechaStr = fila[CONFIG.COL.FECHA] instanceof Date
        ? Utilities.formatDate(fila[CONFIG.COL.FECHA], tz, 'yyyy-MM-dd')
        : String(fila[CONFIG.COL.FECHA] || '').trim();

      reservas.push({
        idReserva:          String(fila[CONFIG.COL.ID_RESERVA] || ''),
        idOriginal:         String(fila[CONFIG.COL.ID_ORIGINAL] || fila[CONFIG.COL.ID_RESERVA] || ''),
        correo:             String(fila[CONFIG.COL.CORREO] || ''),
        fecha:              fechaStr,
        horaInicio:         formatearHoraSegura_(fila[CONFIG.COL.HORA_INICIO]),
        horaFin:            formatearHoraSegura_(fila[CONFIG.COL.HORA_FIN]),
        estado:             String(fila[CONFIG.COL.ESTADO] || ''),
        coworking:          String(fila[CONFIG.COL.COWORKING] || ''),
        nombreCompleto:     String(fila[CONFIG.COL.NOMBRE_COMPLETO] || ''),
        codigo:             String(fila[CONFIG.COL.CODIGO] || ''),
        telefono:           String(fila[CONFIG.COL.TELEFONO] || ''),
        extension:          String(fila[CONFIG.COL.EXTENSION] || ''),
        rol:                String(fila[CONFIG.COL.ROL] || ''),
        actividad:          String(fila[CONFIG.COL.ACTIVIDAD] || ''),
        descripcion:        String(fila[CONFIG.COL.DESCRIPCION] || ''),
        ods:                String(fila[CONFIG.COL.ODS] || ''),
        fechaRegistro:      fila[CONFIG.COL.FECHA_REGISTRO] instanceof Date
          ? Utilities.formatDate(fila[CONFIG.COL.FECHA_REGISTRO], tz, 'dd/MM/yyyy HH:mm')
          : String(fila[CONFIG.COL.FECHA_REGISTRO] || ''),
        motivoRechazo:      String(fila[CONFIG.COL.MOTIVO_RECHAZO] || ''),
        tipoActividad:      String(fila[CONFIG.COL.TIPO_ACTIVIDAD] || ''),
        correoResponsable:  String(fila[CONFIG.COL.CORREO_RESPONSABLE] || ''),
        nombreEncargado:    String(fila[CONFIG.COL.NOMBRE_ENCARGADO] || ''),
        apellidosEncargado: String(fila[CONFIG.COL.APELLIDOS_ENCARGADO] || ''),
        correoEncargado:    String(fila[CONFIG.COL.CORREO_ENCARGADO] || ''),
        idCalendar:         String(fila[CONFIG.COL.ID_CALENDAR] || '')
      });
    }

    // Más recientes primero.
    reservas.sort((a, b) => {
      const fa = `${a.fecha} ${a.horaInicio}`;
      const fb = `${b.fecha} ${b.horaInicio}`;
      return fb.localeCompare(fa);
    });

    return { exito: true, reservas };
  } catch (e) {
    return { exito: false, mensaje: e.toString(), reservas: [] };
  }
}

// Mantener esta función para compatibilidad con versiones anteriores.
function obtenerReservasDevueltas(correoUsuario) {
  const resultado = obtenerMisReservas(correoUsuario);
  if (!resultado.exito) return resultado;
  resultado.reservas = (resultado.reservas || []).filter(r => r.estado === CONFIG.ESTADOS.DEVUELTA);
  return resultado;
}

function obtenerDetalleReserva(idReserva, correoUsuario) {
  try {
    const ss            = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila    = sheetReservas.getLastRow();
    if (ultimaFila <= 1) return { exito: false, mensaje: 'No hay reservas.' };

    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, CONFIG.COL.CORREO_ENCARGADO + 1).getValues();
    const tz    = ss.getSpreadsheetTimeZone();
    const correoSolicitante = String(correoUsuario || '').trim().toLowerCase();

    for (const fila of datos) {
      if (String(fila[CONFIG.COL.ID_RESERVA]).trim() !== String(idReserva).trim()) continue;
      if (String(fila[CONFIG.COL.CORREO]).toLowerCase() !== correoSolicitante) {
        return { exito: false, mensaje: 'No tienes permiso para ver esta reserva.' };
      }

      const fechaStr = fila[CONFIG.COL.FECHA] instanceof Date
        ? Utilities.formatDate(fila[CONFIG.COL.FECHA], tz, 'yyyy-MM-dd')
        : String(fila[CONFIG.COL.FECHA] || '').trim();

      const partes = String(fila[CONFIG.COL.NOMBRE_COMPLETO] || '').split(' ');
      let archivosUrls = [];
      try {
        const archStr = String(fila[CONFIG.COL.ARCHIVOS_URLS] || '');
        if (archStr) archivosUrls = JSON.parse(archStr);
      } catch (e) {}

      return {
        exito: true,
        reserva: {
          idReserva:          String(fila[CONFIG.COL.ID_RESERVA] || ''),
          idOriginal:         String(fila[CONFIG.COL.ID_ORIGINAL] || fila[CONFIG.COL.ID_RESERVA] || ''),
          correo:             String(fila[CONFIG.COL.CORREO] || ''),
          fecha:              fechaStr,
          horaInicio:         formatearHoraSegura_(fila[CONFIG.COL.HORA_INICIO]),
          horaFin:            formatearHoraSegura_(fila[CONFIG.COL.HORA_FIN]),
          estado:             String(fila[CONFIG.COL.ESTADO] || ''),
          coworking:          String(fila[CONFIG.COL.COWORKING] || ''),
          nombreCompleto:     String(fila[CONFIG.COL.NOMBRE_COMPLETO] || ''),
          nombres:            partes[0] || '',
          apellidoPaterno:    partes[1] || '',
          apellidoMaterno:    partes.slice(2).join(' ') || '',
          codigo:             String(fila[CONFIG.COL.CODIGO] || ''),
          telefono:           String(fila[CONFIG.COL.TELEFONO] || ''),
          extension:         String(fila[CONFIG.COL.EXTENSION] || ''),
          rol:               String(fila[CONFIG.COL.ROL] || ''),
          actividad:         String(fila[CONFIG.COL.ACTIVIDAD] || ''),
          descripcion:       String(fila[CONFIG.COL.DESCRIPCION] || ''),
          ods:               String(fila[CONFIG.COL.ODS] || ''),
          motivoRechazo:     String(fila[CONFIG.COL.MOTIVO_RECHAZO] || ''),
          tipoActividad:     String(fila[CONFIG.COL.TIPO_ACTIVIDAD] || ''),
          correoResponsable: String(fila[CONFIG.COL.CORREO_RESPONSABLE] || ''),
          nombreEncargado:   String(fila[CONFIG.COL.NOMBRE_ENCARGADO] || ''),
          apellidosEncargado:String(fila[CONFIG.COL.APELLIDOS_ENCARGADO] || ''),
          correoEncargado:   String(fila[CONFIG.COL.CORREO_ENCARGADO] || ''),
          archivosExistentes: archivosUrls
        }
      };
    }
    return { exito: false, mensaje: 'Reserva no encontrada.' };
  } catch (e) {
    return { exito: false, mensaje: e.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// GOOGLE DRIVE – Subida de archivos
// ─────────────────────────────────────────────────────────────
function subirArchivosADrive_(archivos, correoUsuario) {
  const urls = [];
  try {
    const folder = obtenerOCrearCarpetaDrive_();
    const subFolder = obtenerOCrearSubcarpeta_(folder, correoUsuario);

    for (const archivo of archivos) {
      try {
        if (!archivo.base64 || !archivo.nombre) continue;

        const blob = Utilities.newBlob(
          Utilities.base64Decode(archivo.base64),
          archivo.tipo || 'application/octet-stream',
          archivo.nombre
        );

        const driveFile = subFolder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        urls.push({
          nombre: archivo.nombre,
          url:    driveFile.getUrl(),
          id:     driveFile.getId()
        });
      } catch (eArch) {
        registrarLog_('SISTEMA', 'ERROR_SUBIDA_ARCHIVO', `Archivo: ${archivo.nombre} | Error: ${eArch.toString()}`);
      }
    }
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_DRIVE', e.toString());
  }
  return urls;
}

function obtenerOCrearCarpetaDrive_() {
  const carpetas = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  return carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function obtenerOCrearSubcarpeta_(padre, nombre) {
  const nombreLimpio = String(nombre).replace(/[^a-zA-Z0-9@._-]/g, '_');
  const subs = padre.getFoldersByName(nombreLimpio);
  return subs.hasNext() ? subs.next() : padre.createFolder(nombreLimpio);
}

// ─────────────────────────────────────────────────────────────
// GOOGLE CALENDAR
// ─────────────────────────────────────────────────────────────
/**
 * FASE 1: Crea un evento borrador invitando solo al estudiante
 */
function crearEventoBorrador_(datos, fh, idReserva) {
  try {
    const calendar = CONFIG.CALENDAR_ID ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID) : CalendarApp.getDefaultCalendar();
    
    let fStr = fh.fecha;
    if (fStr.includes('/')) {
      const partes = fStr.split('/');
      fStr = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;
    }

    const inicio = new Date(`${fStr}T${fh.horaEntrada}:00`);
    const fin    = new Date(`${fStr}T${fh.horaSalida}:00`);

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return '';

    const titulo = `[PENDIENTE] Reserva: ${datos.coworking} – ${datos.actividad}`;
    const descripEvento = `Tu solicitud de reserva está en proceso de revisión por el administrador.\n\nID Reserva: ${idReserva}`;

    const evento = calendar.createEvent(titulo, inicio, fin, {
      description: descripEvento,
      guests:      datos.correo, // Solo se invita al estudiante
      sendInvites: true,
      location:    datos.coworking
    });

    return evento.getId();
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_CREAR_BORRADOR', e.toString());
    return '';
  }
}

/**
 * FASE 2A: Quita el [PENDIENTE] e invita al equipo administrativo
 */
function confirmarEventoExistente_(idCalendar, filaReserva, adminCorreo) {
  if (!idCalendar) return;

  try {
    const calendar = CONFIG.CALENDAR_ID ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID) : CalendarApp.getDefaultCalendar();
    const evento = calendar.getEventById(idCalendar);
    
    if (!evento) return;

    const correoSolicitante = String(filaReserva[CONFIG.COL.CORREO]);
    const nombre            = String(filaReserva[CONFIG.COL.NOMBRE_COMPLETO]);
    const coworking         = String(filaReserva[CONFIG.COL.COWORKING]);
    const actividad         = String(filaReserva[CONFIG.COL.ACTIVIDAD]);
    const descripcion       = String(filaReserva[CONFIG.COL.DESCRIPCION]);
    const correoResponsable = String(filaReserva[CONFIG.COL.CORREO_RESPONSABLE] || '');

    const titulo      = `✅ Reserva Confirmada: ${coworking} – ${actividad}`;
    const descripEvento = `Reserva confirmada en ${coworking}.\n\nSolicitante: ${nombre}\nCorreo: ${correoSolicitante}\nActividad: ${actividad}\n\nDescripción:\n${descripcion}`;

    evento.setTitle(titulo);
    evento.setDescription(descripEvento);

    // Añadir equipo administrativo
    if (adminCorreo && adminCorreo !== correoSolicitante) evento.addGuest(adminCorreo);
    if (CONFIG.CORREO_COORDINADOR_1) evento.addGuest(CONFIG.CORREO_COORDINADOR_1);
    if (CONFIG.CORREO_COORDINADOR_2) evento.addGuest(CONFIG.CORREO_COORDINADOR_2);
    if (correoResponsable) evento.addGuest(correoResponsable);

  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_CONFIRMAR_CALENDAR', e.toString());
  }
}

/**
 * FASE 2B: Elimina el evento si se rechaza
 */
function eliminarEventoBorrador_(idCalendar) {
  if (!idCalendar) return;
  try {
    const calendar = CONFIG.CALENDAR_ID ? CalendarApp.getCalendarById(CONFIG.CALENDAR_ID) : CalendarApp.getDefaultCalendar();
    const evento = calendar.getEventById(idCalendar);
    if (evento) evento.deleteEvent();
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_ELIMINAR_CALENDAR', e.toString());
  }
}

// ─────────────────────────────────────────────────────────────
// PLANTILLAS Y CORREOS CORPORATIVOS
// ─────────────────────────────────────────────────────────────
function generarPlantillaCorporativa_(opciones) {
  const { titulo, subtitulo, nombreUsuario, estado, estadoColor, estadoIcono, detalles, mensajePrincipal, mensajeAdicional, cta, ctaUrl } = opciones;

  const filasDetalles = (detalles || []).map(d => `
    <tr>
      <td style="padding:12px 0; border-bottom:1px solid #e5e7eb; vertical-align:top;">
        <strong style="color:${CONFIG.COLOR_PRIMARIO};">${d.etiqueta}</strong>
      </td>
      <td style="padding:12px 0; border-bottom:1px solid #e5e7eb; color:#334155;">${d.valor || '—'}</td>
    </tr>`).join('');

  const ctaHtml = (cta && ctaUrl) ? `
    <tr>
      <td style="padding:14px 18px;">
        <a href="${ctaUrl}" style="background-color:${CONFIG.COLOR_PRIMARIO}; color:#ffffff; padding:10px 18px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:bold; display:inline-block;">${cta}</a>
      </td>
    </tr>` : '';

  const mensajeAdicionalHtml = mensajeAdicional ? `<p style="margin:16px 0 0; color:#334155; font-size:14px; background-color:#f8fafc; padding:12px; border-left:4px solid ${estadoColor};">${mensajeAdicional}</p>` : '';

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9; font-family:Arial,Helvetica,sans-serif; -webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding: 20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
              <td style="background-color:${CONFIG.COLOR_PRIMARIO}; padding:24px; text-align:center;">
                <div style="max-width:160px; margin:0 auto 10px;">
                  <img src="${CONFIG.LOGO_URL}" alt="UdeG" style="max-width:100%; height:auto;">
                </div>
                <h1 style="color:#ffffff; font-size:20px; margin:0 0 4px; font-weight:700;">${titulo}</h1>
                <p style="color:#bcd4ec; margin:0; font-size:13px;">${subtitulo}</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:15px; line-height:1.5;">Hola, <b>${nombreUsuario || 'Usuario'}</b>. ${mensajePrincipal}</p>
                ${filasDetalles ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${filasDetalles}</table>` : ''}
                ${mensajeAdicionalHtml}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px; background-color:#f8fafc; border-radius:8px;">
                  <tr>
                    <td style="padding:14px 18px; border-bottom:1px solid #e5e7eb;">
                      <strong style="font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:${estadoColor};">${estadoIcono || '●'} ${estado || ''}</strong>
                    </td>
                  </tr>
                  ${ctaHtml}
                </table>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background-color:#e2e8f0; padding:16px 24px; text-align:center; border-top:1px solid #cbd5e1;">
                <p style="margin:0; color:#475569; font-size:11px; line-height:1.4;">
                  Este correo fue generado automáticamente por el sistema.<br>
                  Universidad de Guadalajara · CUCEI
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

function enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, idsReservas, fechasConHorario) {
  try {
    const fechasStr = (fechasConHorario || []).map(fh => {
      const [y, m, d] = fh.fecha.split('-');
      return `${d}/${m}/${y} (${fh.horaEntrada}–${fh.horaSalida})`;
    }).join('<br>');

    const html = generarPlantillaCorporativa_({
      titulo:           '¡Solicitud Recibida!',
      subtitulo:        'Tu solicitud de reserva ha sido registrada exitosamente',
      nombreUsuario:    datos.nombres,
      estado:           'En Espera de Aprobación',
      estadoColor:      '#d97706',
      estadoIcono:      '⏳',
      mensajePrincipal: 'Tu solicitud de reserva ha sido recibida y está siendo revisada por el equipo de administración.',
      detalles: [
        { etiqueta: 'ID(s) Reserva',  valor: idsReservas.join(', ') },
        { etiqueta: 'Espacio',        valor: datos.coworking },
        { etiqueta: 'Tipo Actividad', valor: datos.tipoActividad || '—' },
        { etiqueta: 'Evento',         valor: datos.actividad },
        { etiqueta: 'Fechas',         valor: fechasStr },
        { etiqueta: 'ODS',            valor: odsTexto }
      ]
    });

    MailApp.sendEmail({
      to:       datos.correo,
      subject:  `📋 Solicitud Recibida – ${datos.coworking} | ${datos.actividad}`,
      htmlBody: html
    });
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_CORREO_CONFIRMACION', e.toString());
  }
}

function notificarNuevaReservaAdmin_(datos, nombreCompleto, idsReservas, fechasConHorario) {
  try {
    const ss       = SpreadsheetApp.getActiveSpreadsheet();
    const sheet    = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const userData = sheet.getDataRange().getValues();
    const admins   = [];

    for (let i = 1; i < userData.length; i++) {
      if (String(userData[i][4]) === 'admin') admins.push(String(userData[i][1]));
    }
    if (CONFIG.CORREO_ADMIN_NOTIFICACIONES) admins.push(CONFIG.CORREO_ADMIN_NOTIFICACIONES);

    const destinatarios = [...new Set(admins)].filter(c => c && c.includes('@'));
    if (destinatarios.length === 0) return;

    const fechasStr = (fechasConHorario || []).map(fh => {
      const [y, m, d] = fh.fecha.split('-');
      return `${d}/${m}/${y} (${fh.horaEntrada}–${fh.horaSalida})`;
    }).join('<br>');

    const html = generarPlantillaCorporativa_({
      titulo:           'Nueva Solicitud Pendiente',
      subtitulo:        'Se ha recibido una nueva solicitud de reserva',
      nombreUsuario:    'Administrador',
      estado:           'Acción Requerida',
      estadoColor:      CONFIG.COLOR_PRIMARIO,
      estadoIcono:      '🔔',
      mensajePrincipal: `Se ha registrado una nueva solicitud de reserva que requiere tu aprobación o rechazo.`,
      detalles: [
        { etiqueta: 'ID(s)',          valor: idsReservas.join(', ') },
        { etiqueta: 'Solicitante',    valor: nombreCompleto },
        { etiqueta: 'Correo',         valor: datos.correo },
        { etiqueta: 'Espacio',        valor: datos.coworking },
        { etiqueta: 'Tipo Actividad', valor: datos.tipoActividad || '—' },
        { etiqueta: 'Fechas',         valor: fechasStr }
      ],
      cta: 'Ir al panel de administración',
      ctaUrl: `https://script.google.com/macros/s/${ScriptApp.getScriptId()}/exec`
    });

    MailApp.sendEmail({
      to:       destinatarios.join(','),
      subject:  `🔔 Nueva Solicitud Pendiente – ${datos.coworking}`,
      htmlBody: html
    });
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_NOTIF_ADMIN', e.toString());
  }
}

function enviarNotificacionCambioEstado_(correoUsuario, idReserva, nuevoEstado, filaReserva, motivoRechazo) {
  try {
    const esAprobada = nuevoEstado === CONFIG.ESTADOS.ACEPTADA;
    const esDevuelta = nuevoEstado === CONFIG.ESTADOS.DEVUELTA;
    const coworking  = String(filaReserva[CONFIG.COL.COWORKING]);
    const nombre     = String(filaReserva[CONFIG.COL.NOMBRE_COMPLETO]).split(' ')[0];
    const actividad  = String(filaReserva[CONFIG.COL.ACTIVIDAD]);

    let estadoColor  = '#dc2626';
    let estadoIcono  = '❌';
    let titulo       = 'Solicitud Rechazada';
    let subtitulo    = 'Tu solicitud de reserva no fue aprobada';
    let mensajePpal  = `Lamentamos informarte que tu solicitud de reserva en ${coworking} ha sido rechazada.`;

    if (esAprobada) {
      estadoColor  = '#10b981';
      estadoIcono  = '✅';
      titulo       = '¡Reserva Aprobada!';
      subtitulo    = 'Tu solicitud de reserva ha sido confirmada';
      mensajePpal  = `¡Excelente noticia! Tu solicitud de reserva en ${coworking} ha sido aprobada. Revisa tu calendario para ver la invitación oficial.`;
    } else if (esDevuelta) {
      estadoColor  = '#8b5cf6';
      estadoIcono  = '↩️';
      titulo       = 'Solicitud Devuelta para Edición';
      subtitulo    = 'El administrador ha devuelto tu solicitud para que la corrijas';
      mensajePpal  = `Tu solicitud de reserva en ${coworking} ha sido devuelta. Por favor, ingresa al sistema en la sección "Mis Reservas" para corregirla y reenviarla.`;
    }

    let fechaStr = '';
    try {
      const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      const fRaw = filaReserva[CONFIG.COL.FECHA];
      const fS = fRaw instanceof Date ? Utilities.formatDate(fRaw, tz, 'yyyy-MM-dd') : String(fRaw).trim();
      const [y, m, d] = fS.split('-');
      fechaStr = `${d}/${m}/${y}`;
    } catch (e) { /* ignore */ }

    const html = generarPlantillaCorporativa_({
      titulo,
      subtitulo,
      nombreUsuario:    nombre,
      estado:           nuevoEstado,
      estadoColor,
      estadoIcono,
      mensajePrincipal: mensajePpal,
      mensajeAdicional: motivoRechazo ? `Motivo especificado por el administrador: ${motivoRechazo}` : null,
      detalles: [
        { etiqueta: 'ID Reserva', valor: idReserva },
        { etiqueta: 'Espacio',    valor: coworking },
        { etiqueta: 'Actividad',  valor: actividad },
        { etiqueta: 'Fecha',      valor: fechaStr },
        { etiqueta: 'Horario',    valor: `${formatearHoraSegura_(filaReserva[CONFIG.COL.HORA_INICIO])} – ${formatearHoraSegura_(filaReserva[CONFIG.COL.HORA_FIN])}` }
      ]
    });

    const asunto = esAprobada ? `✅ Reserva Aprobada – ${coworking}` : esDevuelta ? `↩️ Solicitud Devuelta – ${coworking}` : `❌ Solicitud Rechazada – ${coworking}`;
    MailApp.sendEmail({ to: correoUsuario, subject: asunto, htmlBody: html });
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_CORREO_ESTADO', e.toString());
  }
}

function notificarAceptacionCoordinadores_(filaReserva) {
  try {
    const destinatarios = [];
    if (CONFIG.CORREO_COORDINADOR_1) destinatarios.push(CONFIG.CORREO_COORDINADOR_1);
    if (CONFIG.CORREO_COORDINADOR_2) destinatarios.push(CONFIG.CORREO_COORDINADOR_2);
    
    const validEmails = destinatarios.filter(c => c && c.includes('@'));
    if (validEmails.length === 0) return;

    const coworking = String(filaReserva[CONFIG.COL.COWORKING]);
    const actividad = String(filaReserva[CONFIG.COL.ACTIVIDAD]);
    const nombre    = String(filaReserva[CONFIG.COL.NOMBRE_COMPLETO]);
    
    let fechaStr = '';
    try {
      const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      const fRaw = filaReserva[CONFIG.COL.FECHA];
      const fS = fRaw instanceof Date ? Utilities.formatDate(fRaw, tz, 'yyyy-MM-dd') : String(fRaw).trim();
      const [y, m, d] = fS.split('-');
      fechaStr = `${d}/${m}/${y}`;
    } catch (e) { /* ignore */ }

    const html = generarPlantillaCorporativa_({
      titulo:           'Reserva Confirmada',
      subtitulo:        'Se ha aprobado una nueva reserva en tu espacio',
      nombreUsuario:    'Coordinador',
      estado:           'Aceptada',
      estadoColor:      '#10b981', // Verde éxito
      estadoIcono:      '✅',
      mensajePrincipal: `El administrador ha confirmado una reserva para el espacio ${coworking}. Ya fuiste añadido al evento de Google Calendar de forma automática.`,
      detalles: [
        { etiqueta: 'ID Reserva', valor: String(filaReserva[CONFIG.COL.ID_RESERVA]) },
        { etiqueta: 'Espacio',    valor: coworking },
        { etiqueta: 'Actividad',  valor: actividad },
        { etiqueta: 'Solicitante',valor: nombre },
        { etiqueta: 'Fecha',      valor: fechaStr },
        { etiqueta: 'Horario',    valor: `${formatearHoraSegura_(filaReserva[CONFIG.COL.HORA_INICIO])} – ${formatearHoraSegura_(filaReserva[CONFIG.COL.HORA_FIN])}` }
      ]
    });

    MailApp.sendEmail({
      to:       validEmails.join(','),
      subject:  `📅 Nueva Reserva Confirmada – ${coworking}`,
      htmlBody: html
    });
  } catch (e) {
    registrarLog_('SISTEMA', 'ERROR_CORREO_COORDINADORES', e.toString());
  }
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES AUXILIARES
// ─────────────────────────────────────────────────────────────
function esAdmin_(correo) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase() === String(correo).toLowerCase() && String(data[i][4]) === 'admin') return true;
    }
    return false;
  } catch (e) { return false; }
}

function generarIdReserva_() {
  return `RES-${Utilities.formatDate(new Date(),'America/Mexico_City','yyyyMMdd')}-${Math.random().toString(36).substring(2,7).toUpperCase()}`;
}

function formatearHoraSegura_(valor) {
  if (!valor) return '00:00';
  if (valor instanceof Date) return Utilities.formatDate(valor, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'HH:mm');
  const str = String(valor).trim();
  const match = str.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    if (match[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${match[2]}`;
  }
  return str.substring(0, 5);
}

function convertirHoraAMinutos_(horaStr) {
  const p = String(horaStr).split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function convertirMinutosAHoraString_(m) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

function formatearFechaLegible_(fStr) {
  const p = String(fStr).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : fStr;
}

function correoInstitucionalValido_(correo) {
  const c = String(correo || '').trim().toLowerCase();
  return /@(alumnos\.udg\.mx|academicos\.udg\.mx|cucei\.udg\.mx)$/.test(c);
}

function validarDatosReserva_(datos) {
  const req = ['correo','nombres','apellidoPaterno','coworking'];
  for (const c of req) {
    if (!datos[c] || String(datos[c]).trim() === '') {
      return { valido: false, mensaje: `El campo "${c}" es obligatorio.` };
    }
  }

  const rol = String(datos.rol || '').toLowerCase();
  const esAcademico = rol === 'maestro';

  // El encargado es opcional, pero si se captura debe completarse y usar un correo institucional válido.
  if (esAcademico) {
    const nombreEncargado = String(datos.nombreEncargado || '').trim();
    const apellidosEncargado = String(datos.apellidosEncargado || '').trim();
    const correoEncargado = String(datos.correoEncargado || '').trim().toLowerCase();

    const hayDatosEncargado = nombreEncargado || apellidosEncargado || correoEncargado;
    if (hayDatosEncargado) {
      if (!nombreEncargado || !apellidosEncargado || !correoEncargado) {
        return { valido: false, mensaje: 'Si agregas un encargado, debes capturar nombre, apellidos y correo.' };
      }
      if (!correoInstitucionalValido_(correoEncargado)) {
        return { valido: false, mensaje: 'El correo del encargado debe terminar en @alumnos.udg.mx, @academicos.udg.mx o @cucei.udg.mx.' };
      }
    }
  }

  const fch = datos.fechasConHorario || [];
  if (fch.length === 0 && (!datos.fechas || datos.fechas.length === 0)) {
    return { valido: false, mensaje: 'Selecciona al menos una fecha.' };
  }
  if (!datos.tipoActividad) return { valido: false, mensaje: 'Selecciona un tipo de actividad.' };
  return { valido: true };
}

function procesarRegistroLegacy_(datos, nombreCompleto, odsTexto, fechasConHorario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRegistros = ss.getSheetByName(CONFIG.SHEET_REGISTROS);
  if (!sheetRegistros) return;

  for (const fh of (fechasConHorario || [])) {
    const hSlots = [];
    for (let m = convertirHoraAMinutos_(fh.horaEntrada); m < convertirHoraAMinutos_(fh.horaSalida); m += 30) {
      hSlots.push(convertirMinutosAHoraString_(m));
    }
    for (const slot of hSlots) {
      sheetRegistros.appendRow([
        new Date(), datos.correo, datos.nombres, datos.apellidoPaterno,
        datos.apellidoMaterno, datos.codigo, datos.telefono, datos.rol,
        datos.extension || 'N/A', datos.actividad, datos.descripcionActividad,
        datos.coworking, fh.fecha, slot, odsTexto, ''
      ]);
    }
  }
}

function registrarLog_(usuario, accion, detalles) {
  try {
    const sheet = obtenerOCrearHoja_(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEET_LOGS);
    sheet.appendRow([
      new Date(),
      String(usuario),
      String(accion),
      String(detalles).substring(0, 500)
    ]);
  } catch (e) {
    /* Si falla el log, no rompemos la ejecución principal */
  }
}
/**
 * Elimina archivos huérfanos o rechazados de Google Drive (Los mueve a la papelera)
 */
function eliminarArchivosDeDrive_(archivosUrls) {
  if (!archivosUrls || archivosUrls.length === 0) return;
  for (const arch of archivosUrls) {
    try {
      if (arch.id) {
        DriveApp.getFileById(arch.id).setTrashed(true); // Se manda a papelera por seguridad
      }
    } catch (e) {
      registrarLog_('SISTEMA', 'ERROR_ELIMINAR_ARCHIVO', `ID: ${arch.id} - ${e.toString()}`);
    }
  }
}
  