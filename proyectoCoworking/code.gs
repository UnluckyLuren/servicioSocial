/**
 * ============================================================
 * CUCEI COWORKING SYSTEM - Backend Principal
 * Code.gs
 * ============================================================
 */

const CONFIG = {
  SHEET_USUARIOS:    'usuarios',
  SHEET_RESERVAS:    'capacidad',
  SHEET_LOGS:        'logs',
  SHEET_CONFIG:      'Configuracion',
  SHEET_REGISTROS:   'Registros',

  DOMINIOS_ALUMNO:   ['@alumnos.udg.mx'],
  // Se agregó el dominio de administrativos aquí:
  DOMINIOS_MAESTRO:  ['@academicos.udg.mx', '@cucei.udg.mx', '@administrativos.udg.mx'],

  ESTADOS: { PENDIENTE: 'Pendiente', ACEPTADA:  'Aceptada', RECHAZADA: 'Rechazada' },
  HORA_APERTURA: '08:00',
  HORA_CIERRE:   '20:00'
};

function doGet() {
  try {
    inicializarHojas_();
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Coworkings CUCEI - Reservas')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch (error) {
    registrarLog_('SISTEMA', 'ERROR_DOGet', error.toString());
    return HtmlService.createHtmlOutput('Error detallado al cargar: ' + error.toString());
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN CUSTOM Y REGISTRO (Roles adaptados)
// ─────────────────────────────────────────────────────────────

/** Hashea la contraseña con SHA-256 */
function hashPassword_(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length == 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function determinarRolUsuario_(correo) {
  const correoLower = correo.toLowerCase();

  // Si el dominio es academico/cucei el rol predeterminado es "maestro"
  const esMaestro = CONFIG.DOMINIOS_MAESTRO.some(d => correoLower.endsWith(d));
  if (esMaestro) return 'maestro';

  const esAlumno = CONFIG.DOMINIOS_ALUMNO.some(d => correoLower.endsWith(d));
  if (esAlumno) return 'alumno';

  return 'denegado';
}



function registrarUsuarioCustom(correo, codigo, contrasenia) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data = sheet.getDataRange().getValues();
    const correoLower = String(correo).trim().toLowerCase();
    const codigoLower = String(codigo).trim().toLowerCase();

    const rol = determinarRolUsuario_(correoLower);
    if (rol === 'denegado') {
      return { exito: false, mensaje: 'El correo no pertenece a un dominio autorizado (@alumnos, @academicos, @cucei, @administrativos).' };
    }

    // Verificar existencia
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[1]).toLowerCase() === correoLower) return { exito: false, mensaje: 'El correo ya está registrado.' };
      if (String(row[2]).toLowerCase() === codigoLower) return { exito: false, mensaje: 'El código ya está registrado.' };
    }

    const passHash = hashPassword_(contrasenia);
    const nuevoId = `USR-${Date.now()}`;
    sheet.appendRow([nuevoId, correoLower, codigoLower, passHash, rol, '', new Date()]);
    registrarLog_(correoLower, 'REGISTRO_USUARIO', `Rol asignado: ${rol}`);

    return { exito: true, mensaje: 'Registro exitoso.' };
  } catch(e) {
     return { exito: false, mensaje: 'Error interno: ' + e.toString() };
  }
}

function loginUsuarioCustom(identificador, contrasenia) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data = sheet.getDataRange().getValues();
    const idLower = String(identificador).trim().toLowerCase();
    const passHash = hashPassword_(contrasenia);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const correo = String(row[1]).toLowerCase();
      const codigo = String(row[2]).toLowerCase();
      const storedHash = String(row[3]);

      if (correo === idLower || codigo === idLower) {
        if (storedHash === passHash) {
          // row[4] lee el rol directamente de la base de datos (por si un admin lo actualizó)
          return {
            exito: true,
            usuario: {
              accesoConcedido: true,
              correo: row[1],
              codigo: row[2],
              rol: row[4],
              nombre: row[5]
            }
          };
        } else {
          return { exito: false, mensaje: 'Contraseña incorrecta.' };
        }
      }
    }
    return { exito: false, mensaje: 'Usuario no encontrado.' };
  } catch(e) {
    return { exito: false, mensaje: 'Error interno: ' + e.toString() };
  }
}


// ─────────────────────────────────────────────────────────────
// MÓDULO: GESTIÓN DE USUARIOS (NUEVO)
// ─────────────────────────────────────────────────────────────

function obtenerListaUsuarios(adminCorreo) {
  try {
    // Validacion basica (el frontend restringe, pero se puede poner validación estricta leyendo la hoja de nuevo)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data = sheet.getDataRange().getValues();

    let isRequeridorAdmin = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase() === String(adminCorreo).toLowerCase() && data[i][4] === 'admin') {
        isRequeridorAdmin = true; break;
      }
    }

    if (!isRequeridorAdmin) return { exito: false, mensaje: 'Permisos insuficientes.' };

    const usuarios = [];
    for (let i = 1; i < data.length; i++) {
      if(!data[i][0]) continue;
      usuarios.push({
        id: data[i][0],
        correo: data[i][1],
        codigo: data[i][2],
        rol: data[i][4]
      });
    }

    return { exito: true, usuarios: usuarios };
  } catch(e) {
    return { exito: false, mensaje: e.toString() };
  }
}

function actualizarRolUsuario(idUsuario, nuevoRol, adminCorreo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(idUsuario)) {
        sheet.getRange(i + 1, 5).setValue(nuevoRol); // Columna E (5) es el Rol
        registrarLog_(adminCorreo, 'CAMBIO_ROL_USUARIO', `User ID: ${idUsuario} cambiado a ${nuevoRol}`);
        return { exito: true, mensaje: 'Rol actualizado exitosamente' };
      }
    }
    return { exito: false, mensaje: 'Usuario no encontrado' };
  } catch (e) {
    return { exito: false, mensaje: e.toString() };
  }
}


// ─────────────────────────────────────────────────────────────
// MÓDULO: RESERVAS Y ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────

function registrarReserva(datos, sesionCorreo) {
  try {
    const validacion = validarDatosReserva_(datos);
    if (!validacion.valido) return { exito: false, mensaje: validacion.mensaje };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const nombreCompleto = `${datos.nombres} ${datos.apellidoPaterno} ${datos.apellidoMaterno}`.trim();
    const odsTexto = (datos.ods && datos.ods.length > 0) ? datos.ods.join(', ') : 'Ninguno seleccionado';
    const reservasCreadas = [];

    for (const fechaSol of datos.fechas) {
      const colision = verificarColision_(sheetReservas, datos.coworking, fechaSol, datos.horaEntrada, datos.horaSalida);
      if (colision.hayColision) {
        return { exito: false, mensaje: `Conflicto de horario para el ${formatearFechaLegible_(fechaSol)}: ${colision.mensaje}` };
      }
      const idReserva = generarIdReserva_();
      sheetReservas.appendRow([
        idReserva, datos.correo, fechaSol, datos.horaEntrada, datos.horaSalida,
        CONFIG.ESTADOS.PENDIENTE, datos.coworking, nombreCompleto, datos.codigo,
        datos.telefono, datos.extension || 'N/A', datos.rol, datos.actividad,
        datos.descripcionActividad, odsTexto, new Date()
      ]);
      reservasCreadas.push(idReserva);
    }

    registrarLog_(sesionCorreo, 'RESERVA_CREADA', `IDs: ${reservasCreadas.join(', ')} | Coworking: ${datos.coworking}`);
    enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, reservasCreadas);
    try { procesarRegistroLegacy_(datos, nombreCompleto, odsTexto); } catch (e) { }

    return { exito: true, mensaje: `¡Reserva creada con éxito! Estado: En espera.` };
  } catch (error) {
    return { exito: false, mensaje: 'Error al procesar reserva: ' + error.toString() };
  }
}

function verificarColision_(sheet, coworking, fecha, horaInicio, horaFin) {
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila <= 1) return { hayColision: false };
  const registros = sheet.getRange(2, 1, ultimaFila - 1, 7).getValues();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const inicioNuevo = convertirHoraAMinutos_(horaInicio);
  const finNuevo    = convertirHoraAMinutos_(horaFin);

  for (const fila of registros) {
    const [, , fechaExist, hiExist, hfExist, estadoExist, coworkingExist] = fila;
    if (estadoExist !== CONFIG.ESTADOS.PENDIENTE && estadoExist !== CONFIG.ESTADOS.ACEPTADA) continue;
    if (String(coworkingExist).trim().toLowerCase() !== coworking.trim().toLowerCase()) continue;

    let fechaNorm;
    try { fechaNorm = fechaExist instanceof Date ? Utilities.formatDate(fechaExist, tz, 'yyyy-MM-dd') : String(fechaExist).trim(); }
    catch (e) { continue; }

    if (fechaNorm !== fecha) continue;

    const inicioExist = convertirHoraAMinutos_(String(hiExist).substring(0, 5));
    const finExist    = convertirHoraAMinutos_(String(hfExist).substring(0, 5));
    if (inicioNuevo < finExist && finNuevo > inicioExist) {
      return { hayColision: true, mensaje: `Superposición de horario.` };
    }
  }
  return { hayColision: false };
}

function obtenerDashboardAdmin(adminCorreo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const ultimaFila = sheetReservas.getLastRow();

    if (ultimaFila <= 1) {
      return { exito: true, reservas: [], metricas: { total: 0, pendientes: 0, aceptadas: 0, rechazadas: 0 }, graficaEstados: { labels: ['Pendiente', 'Aceptada', 'Rechazada'], datos: [0, 0, 0] }, graficaEspacios: { labels: [], datos: [] } };
    }

    const datos = sheetReservas.getRange(2, 1, ultimaFila - 1, 16).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    const reservas = [];
    let pendientes = 0, aceptadas = 0, rechazadas = 0;
    const espaciosConteo = {};

    for (const fila of datos) {
      const [idReserva, correo, fecha, horaInicio, horaFin, estado, coworking, nombreCompleto, codigo, telefono, extension, rol, actividad, descripcion, ods, fechaRegistro] = fila;
      if (!idReserva) continue;

      let fechaStr = fecha instanceof Date ? Utilities.formatDate(fecha, tz, 'yyyy-MM-dd') : String(fecha).trim();

      switch(estado) { case CONFIG.ESTADOS.PENDIENTE: pendientes++; break; case CONFIG.ESTADOS.ACEPTADA: aceptadas++; break; case CONFIG.ESTADOS.RECHAZADA: rechazadas++; break; }

      const coworkingKey = String(coworking).trim();
      espaciosConteo[coworkingKey] = (espaciosConteo[coworkingKey] || 0) + 1;

      reservas.push({ idReserva: String(idReserva), correo: String(correo), fecha: fechaStr, horaInicio: formatearHoraSegura_(horaInicio), horaFin: formatearHoraSegura_(horaFin), estado: String(estado), coworking: coworkingKey, nombreCompleto: String(nombreCompleto), codigo: String(codigo), telefono: String(telefono), extension: String(extension), rol: String(rol), actividad: String(actividad), descripcion: String(descripcion), ods: String(ods), fechaRegistro: fechaRegistro instanceof Date ? Utilities.formatDate(fechaRegistro, tz, 'dd/MM/yyyy HH:mm') : String(fechaRegistro) });
    }

    reservas.sort((a, b) => {
      const prioridad = { 'Pendiente': 0, 'Aceptada': 1, 'Rechazada': 2 };
      if (prioridad[a.estado] !== prioridad[b.estado]) return prioridad[a.estado] - prioridad[b.estado];
      return b.fecha.localeCompare(a.fecha);
    });

    registrarLog_(adminCorreo, 'DASHBOARD_CONSULTADO', `Total: ${reservas.length}`);
    return { exito: true, reservas: reservas, metricas: { total: reservas.length, pendientes, aceptadas, rechazadas }, graficaEstados: { labels: ['Pendiente', 'Aceptada', 'Rechazada'], datos: [pendientes, aceptadas, rechazadas] }, graficaEspacios: { labels: Object.keys(espaciosConteo), datos: Object.values(espaciosConteo) } };
  } catch (error) { return { exito: false, mensaje: error.toString() }; }
}

function actualizarEstadoReserva(idReserva, nuevoEstado, adminCorreo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const datos = sheetReservas.getRange(2, 1, sheetReservas.getLastRow() - 1, 16).getValues();

    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() !== String(idReserva).trim()) continue;
      if (datos[i][5] === CONFIG.ESTADOS.ACEPTADA) return { exito: false, mensaje: '🔒 Esta reserva ya fue Aceptada.' };

      sheetReservas.getRange(i + 2, 6).setValue(nuevoEstado);
      registrarLog_(adminCorreo, `RESERVA_${nuevoEstado.toUpperCase()}`, `ID: ${idReserva} | Admin: ${adminCorreo}`);
      enviarNotificacionCambioEstado_(String(datos[i][1]), idReserva, nuevoEstado, datos[i]);
      if (nuevoEstado === CONFIG.ESTADOS.ACEPTADA) crearEventoCalendario_(datos[i]);

      return { exito: true, mensaje: `✅ Reserva ${idReserva} actualizada a "${nuevoEstado}".` };
    }
    return { exito: false, mensaje: `No encontrada.` };
  } catch (error) { return { exito: false, mensaje: error.toString() }; }
}

function buscarReservasPorCorreo(correoBusqueda, adminCorreo) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
    const datos = sheetReservas.getRange(2, 1, sheetReservas.getLastRow() - 1, 16).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    const resultados = [];
    const busquedaLower = correoBusqueda.trim().toLowerCase();

    for (const fila of datos) {
      if (!String(fila[1]).toLowerCase().includes(busquedaLower)) continue;
      let fStr = fila[2] instanceof Date ? Utilities.formatDate(fila[2], tz, 'yyyy-MM-dd') : String(fila[2]).trim();
      resultados.push({ idReserva: String(fila[0]), correo: String(fila[1]), fecha: fStr, horaInicio: String(fila[3]).substring(0, 5), horaFin: String(fila[4]).substring(0, 5), estado: String(fila[5]), coworking: String(fila[6]) });
    }
    registrarLog_(adminCorreo, 'BUSQUEDA_REALIZADA', `"${correoBusqueda}"`);
    return { exito: true, reservas: resultados, mensaje: resultados.length > 0 ? `Se encontraron ${resultados.length} reservas.` : `No se encontraron.` };
  } catch (error) { return { exito: false, mensaje: error.toString() }; }
}

// ─────────────────────────────────────────────────────────────
// CORREOS Y NOTIFICACIONES
// ─────────────────────────────────────────────────────────────

function enviarCorreoConfirmacion_(datos, nombreCompleto, odsTexto, idsReservas) {
  try {
    const fechasFormateadas = datos.fechas.map(f => `${f.split('-')[2]}/${f.split('-')[1]}/${f.split('-')[0]}`).join(', ');
    const html = generarPlantillaCorreo_({ titulo: 'Solicitud Recibida', subtitulo: 'Espera confirmación', nombreUsuario: datos.nombres, estado: 'En espera', estadoColor: '#f59e0b', detalles: [{etiqueta:'Espacio',valor:datos.coworking},{etiqueta:'Fechas',valor:fechasFormateadas},{etiqueta:'Horario',valor:`${datos.horaEntrada}-${datos.horaSalida}`},{etiqueta:'IDs',valor:idsReservas.join(', ')}], mensaje: 'Tu solicitud fue recibida.'});
    MailApp.sendEmail({ to: datos.correo, subject: `📋 Solicitud – ${datos.coworking}`, htmlBody: html });
  } catch (e) {}
}

function enviarNotificacionCambioEstado_(correoUsuario, idReserva, nuevoEstado, filaReserva) {
  try {
    const esAprobada = nuevoEstado === CONFIG.ESTADOS.ACEPTADA;
    const html = generarPlantillaCorreo_({ titulo: esAprobada ? 'Aprobada' : 'Rechazada', subtitulo: esAprobada ? 'Confirmado.' : 'No aprobada.', nombreUsuario: String(filaReserva[7]).split(' ')[0], estado: nuevoEstado, estadoColor: esAprobada ? '#10b981' : '#ef4444', detalles: [{etiqueta:'Espacio',valor:filaReserva[6]},{etiqueta:'ID',valor:idReserva}], mensaje: 'Gestión completada.'});
    MailApp.sendEmail({ to: correoUsuario, subject: esAprobada ? `✅ Aprobada: ${filaReserva[6]}` : `❌ Rechazada: ${filaReserva[6]}`, htmlBody: html });
  } catch (e) {}
}

function generarPlantillaCorreo_(opciones) {
  const filas = opciones.detalles.map(d => `<tr><td style="padding:10px 0; border-bottom:1px solid #f1f5f9;"><strong>${d.etiqueta}</strong><br>${d.valor}</td></tr>`).join('');
  return `<div style="font-family:sans-serif; padding:20px; background:#f8fafc;"><div style="background:#fff; padding:20px; border-radius:8px;"><h2>${opciones.titulo}</h2><p>${opciones.mensaje}</p><table>${filas}</table></div></div>`;
}

// ─────────────────────────────────────────────────────────────
// LOGS Y UTILIDADES BASICAS
// ─────────────────────────────────────────────────────────────

function registrarLog_(usuario, accion, detalles) {
  try {
    const sheet = obtenerOCrearHoja_(SpreadsheetApp.getActiveSpreadsheet(), CONFIG.SHEET_LOGS);
    sheet.appendRow([new Date(), String(usuario), String(accion), String(detalles).substring(0, 500)]);
  } catch (e) {}
}

function inicializarHojas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hUsuarios = obtenerOCrearHoja_(ss, CONFIG.SHEET_USUARIOS);
  if (hUsuarios.getLastRow() === 0) {
    hUsuarios.appendRow(['ID', 'Correo', 'Codigo', 'PasswordHash', 'Rol', 'Nombre', 'Fecha_Registro']);
    hUsuarios.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#002f5c').setFontColor('#ffffff');
  }
  const hReservas = obtenerOCrearHoja_(ss, CONFIG.SHEET_RESERVAS);
  if (hReservas.getLastRow() === 0) {
    hReservas.appendRow(['ID_Reserva', 'Correo', 'Fecha', 'Hora_Inicio', 'Hora_Fin', 'Estado', 'Espacio_Aula', 'Nombre_Completo', 'Codigo', 'Telefono', 'Extension', 'Rol', 'Actividad', 'Descripcion', 'ODS', 'Fecha_Registro']);
    hReservas.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#002f5c').setFontColor('#ffffff');
  }
  const hLogs = obtenerOCrearHoja_(ss, CONFIG.SHEET_LOGS);
  if (hLogs.getLastRow() === 0) {
    hLogs.appendRow(['Timestamp', 'Usuario', 'Accion', 'Detalles']);
  }
}

function obtenerOCrearHoja_(ss, nombre) {
  let sheet = ss.getSheetByName(nombre);
  return sheet ? sheet : ss.insertSheet(nombre);
}

function generarIdReserva_() {
  return `RES-${Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyyMMdd')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

function convertirHoraAMinutos_(horaStr) { const p = String(horaStr).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
function convertirMinutosAHoraString_(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function formatearFechaLegible_(fStr) { const p = fStr.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : fStr; }

function validarDatosReserva_(datos) {
  const campos = ['correo', 'nombres', 'apellidoPaterno', 'coworking', 'horaEntrada', 'horaSalida'];
  for (const c of campos) if (!datos[c] || String(datos[c]).trim() === '') return { valido: false, mensaje: `Campo ${c} vacío.` };
  if (!datos.fechas || datos.fechas.length === 0) return { valido: false, mensaje: 'Selecciona una fecha.' };
  if (convertirHoraAMinutos_(datos.horaEntrada) >= convertirHoraAMinutos_(datos.horaSalida)) return { valido: false, mensaje: 'Salida debe ser posterior a la entrada.' };
  return { valido: true };
}

function procesarRegistroLegacy_(datos, nombreCompleto, odsTexto) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetRegistros = ss.getSheetByName('Registros');
  if (!sheetRegistros) return;
  const hSlots = [];
  for (let m = convertirHoraAMinutos_(datos.horaEntrada); m < convertirHoraAMinutos_(datos.horaSalida); m += 30) hSlots.push(convertirMinutosAHoraString_(m));
  for (const f of datos.fechas) {
    for (const slot of hSlots) {
      sheetRegistros.appendRow([new Date(), datos.correo, datos.nombres, datos.apellidoPaterno, datos.apellidoMaterno, datos.codigo, datos.telefono, datos.rol, datos.extension, datos.actividad, datos.descripcionActividad, datos.coworking, f, slot, odsTexto, '']);
    }
  }
}

function crearEventoCalendario_(fila) {
  try {
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    let fStr = fila[2] instanceof Date ? Utilities.formatDate(fila[2], tz, 'yyyy-MM-dd') : String(fila[2]).trim();
    if (fStr.includes('/')) fStr = `${fStr.split('/')[2]}-${fStr.split('/')[1]}-${fStr.split('/')[0]}`;
    const inicio = new Date(`${fStr}T${formatearHoraSegura_(fila[3])}:00`);
    const fin = new Date(`${fStr}T${formatearHoraSegura_(fila[4])}:00`);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return;
    CalendarApp.getDefaultCalendar().createEvent(`Reserva confirmada: ${fila[6]} - ${fila[7]}`, inicio, fin, { description: fila[13], guests: String(fila[1]), sendInvites: true });
  } catch (e) {}
}

function formatearHoraSegura_(valor) {
  if (!valor) return "00:00";
  if (valor instanceof Date) return Utilities.formatDate(valor, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'HH:mm');
  const str = String(valor).trim();
  const match = str.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    if (match[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${match[2]}`;
  }
  return str.substring(0, 5);
}
