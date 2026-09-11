/******************************************************
 * Admin.gs
 * Lógica para administradores (@cucei.udg.mx):
 * Gestión completa de proyectos, usuarios, configuración
 ******************************************************/

// =====================================================
// DASHBOARD — LISTAR TODOS LOS PROYECTOS
// =====================================================

/**
 * Devuelve todos los proyectos con filtros opcionales.
 * @param {string} token
 * @param {Object} filtros - { estado, malla, busqueda }
 */
function adminListarProyectos(token, filtros) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error, proyectos: [] };
    }

    filtros = filtros || {};
    const filtroEstado = sanitize_((filtros.estado || '').trim());
    const filtroMalla = sanitize_((filtros.malla || '').trim());
    const filtroBusqueda = sanitize_((filtros.busqueda || '').trim()).toLowerCase();

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();
    const proyectos = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];

      // Aplicar filtros
      if (filtroEstado && String(fila[col['Estado']]) !== filtroEstado) continue;
      if (filtroMalla && String(fila[col['TipoMalla']]) !== filtroMalla) continue;
      if (filtroBusqueda) {
        const titulo = String(fila[col['TituloProyecto']] || '').toLowerCase();
        const folio = String(fila[col['Folio']] || '').toLowerCase();
        const lider = String(fila[col['NombreLider']] || '').toLowerCase();
        const email = String(fila[col['EmailLider']] || '').toLowerCase();
        if (titulo.indexOf(filtroBusqueda) === -1 &&
            folio.indexOf(filtroBusqueda) === -1 &&
            lider.indexOf(filtroBusqueda) === -1 &&
            email.indexOf(filtroBusqueda) === -1) continue;
      }

      const proyecto = {};
      Object.keys(col).forEach(nombre => {
        let valor = fila[col[nombre]];
        if (valor instanceof Date) {
          valor = Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        }
        proyecto[nombre] = valor;
      });
      proyecto._fila = i + 1;
      proyectos.push(proyecto);
    }

    return { success: true, proyectos: proyectos, total: proyectos.length };
  } catch (err) {
    console.error('Error en adminListarProyectos: ' + err.message);
    return { success: false, message: 'Error al listar proyectos.', proyectos: [] };
  }
}

// =====================================================
// DETALLE DE UN PROYECTO
// =====================================================

/**
 * Obtiene el detalle completo de un proyecto por folio.
 */
function adminObtenerProyecto(token, folio) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    folio = sanitize_((folio || '').trim());
    if (!folio) {
      return { success: false, message: 'Folio obligatorio.' };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][col['Folio']]).trim() === folio) {
        const proyecto = {};
        Object.keys(col).forEach(nombre => {
          let valor = datos[i][col[nombre]];
          if (valor instanceof Date) {
            valor = Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          }
          proyecto[nombre] = valor;
        });
        proyecto._fila = i + 1;
        return { success: true, proyecto: proyecto };
      }
    }

    return { success: false, message: 'Proyecto no encontrado con folio: ' + folio };
  } catch (err) {
    console.error('Error en adminObtenerProyecto: ' + err.message);
    return { success: false, message: 'Error al obtener proyecto.' };
  }
}

// =====================================================
// CAMBIAR ESTADO DE UN PROYECTO
// =====================================================

/**
 * Permite al admin cambiar el estado de cualquier proyecto.
 */
function adminCambiarEstado(token, folio, nuevoEstado, observaciones) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    folio = sanitize_((folio || '').trim());
    nuevoEstado = sanitize_((nuevoEstado || '').trim());
    observaciones = sanitize_((observaciones || '').trim());

    const estadosValidos = Object.values(ESTADOS_PROYECTO);
    if (estadosValidos.indexOf(nuevoEstado) === -1) {
      return { success: false, message: 'Estado no válido: ' + nuevoEstado };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][col['Folio']]).trim() === folio) {
        const numFila = i + 1;
        const emailLider = String(datos[i][col['EmailLider']]);
        const estadoAnterior = String(datos[i][col['Estado']]);

        const lock = LockService.getScriptLock();
        lock.waitLock(10000);
        try {
          sheet.getRange(numFila, col['Estado'] + 1).setValue(nuevoEstado);

          // Si se marca "No aprobado", resetear secciones para permitir reenvío
          if (nuevoEstado === ESTADOS_PROYECTO.NO_APROBADO) {
            sheet.getRange(numFila, col['Seccion2_Estado'] + 1).setValue(ESTADOS_SECCION.PENDIENTE);
            sheet.getRange(numFila, col['Seccion3_Estado'] + 1).setValue(ESTADOS_SECCION.PENDIENTE);
          }

          if (observaciones) {
            sheet.getRange(numFila, col['Asesor_Observaciones'] + 1).setValue(observaciones);
            sheet.getRange(numFila, col['Asesor_FechaEvaluacion'] + 1).setValue(new Date());
            sheet.getRange(numFila, col['Asesor_Evaluador'] + 1).setValue(auth.sesion.email + ' (admin)');
          }
        } finally {
          lock.releaseLock();
        }

        // Notificar al alumno del cambio
        if (nuevoEstado !== estadoAnterior) {
          enviarCorreoEvaluacion_(emailLider, folio, nuevoEstado, observaciones);
        }

        return {
          success: true,
          message: 'Estado actualizado: ' + estadoAnterior + ' → ' + nuevoEstado
        };
      }
    }

    return { success: false, message: 'Proyecto no encontrado.' };
  } catch (err) {
    console.error('Error en adminCambiarEstado: ' + err.message);
    return { success: false, message: 'Error al cambiar estado.' };
  }
}

// =====================================================
// ELIMINAR UN PROYECTO
// =====================================================

/**
 * Elimina un proyecto (mover a hoja de archivo o borrar fila).
 * Solo admin puede hacer esto.
 */
function adminEliminarProyecto(token, folio) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    folio = sanitize_((folio || '').trim());
    if (!folio) {
      return { success: false, message: 'Folio obligatorio.' };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][col['Folio']]).trim() === folio) {
        const numFila = i + 1;

        // Mover el archivo de Drive a la papelera si existe
        const archivoId = datos[i][col['Seccion2_ArchivoID']];
        if (archivoId) {
          try { DriveApp.getFileById(archivoId).setTrashed(true); } catch (e) { /* ok */ }
        }

        // Archivar la fila en una hoja auxiliar antes de borrar
        const ssAux = getSpreadsheet_();
        let hojaArchivo = ssAux.getSheetByName('Registros_Eliminados');
        if (!hojaArchivo) {
          hojaArchivo = ssAux.insertSheet('Registros_Eliminados');
          hojaArchivo.appendRow(ENCABEZADOS_SECCION1.concat(['FechaEliminacion', 'EliminadoPor']));
          hojaArchivo.setFrozenRows(1);
        }
        const filaCompleta = datos[i].slice();
        filaCompleta.push(new Date());
        filaCompleta.push(auth.sesion.email);
        hojaArchivo.appendRow(filaCompleta);

        // Eliminar fila de la hoja principal
        sheet.deleteRow(numFila);

        return { success: true, message: 'Proyecto ' + folio + ' eliminado (archivado).' };
      }
    }

    return { success: false, message: 'Proyecto no encontrado.' };
  } catch (err) {
    console.error('Error en adminEliminarProyecto: ' + err.message);
    return { success: false, message: 'Error al eliminar proyecto.' };
  }
}

// =====================================================
// GESTIÓN DE USUARIOS
// =====================================================

/**
 * Lista todos los usuarios registrados.
 */
function adminListarUsuarios(token) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error, usuarios: [] };
    }

    const sheet = usuariosSheet_();
    const datos = sheet.getDataRange().getValues();
    const usuarios = [];

    for (let i = 1; i < datos.length; i++) {
      usuarios.push({
        email: String(datos[i][0]),
        rol: String(datos[i][3]),
        fechaRegistro: datos[i][4] instanceof Date
          ? Utilities.formatDate(datos[i][4], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
          : String(datos[i][4]),
        _fila: i + 1
      });
    }

    return { success: true, usuarios: usuarios, total: usuarios.length };
  } catch (err) {
    console.error('Error en adminListarUsuarios: ' + err.message);
    return { success: false, message: 'Error al listar usuarios.', usuarios: [] };
  }
}

/**
 * Elimina la cuenta de un usuario (no elimina sus proyectos).
 */
function adminEliminarUsuario(token, emailUsuario) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    emailUsuario = sanitize_((emailUsuario || '').toLowerCase().trim());
    if (!emailUsuario) {
      return { success: false, message: 'Email del usuario obligatorio.' };
    }

    // No permitir que el admin se elimine a sí mismo
    if (emailUsuario === auth.sesion.email) {
      return { success: false, message: 'No puedes eliminar tu propia cuenta.' };
    }

    const sheet = usuariosSheet_();
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).toLowerCase().trim() === emailUsuario) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Usuario ' + emailUsuario + ' eliminado.' };
      }
    }

    return { success: false, message: 'Usuario no encontrado.' };
  } catch (err) {
    console.error('Error en adminEliminarUsuario: ' + err.message);
    return { success: false, message: 'Error al eliminar usuario.' };
  }
}

// =====================================================
// CONFIGURACIÓN DEL SISTEMA
// =====================================================

/**
 * Obtiene la configuración actual del sistema.
 */
function adminObtenerConfig(token) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    const sheet = configSheet_();
    const datos = sheet.getDataRange().getValues();
    const config = {};

    for (let i = 1; i < datos.length; i++) {
      config[String(datos[i][0]).trim()] = String(datos[i][1]).trim();
    }

    return { success: true, config: config };
  } catch (err) {
    console.error('Error en adminObtenerConfig: ' + err.message);
    return { success: false, message: 'Error al obtener configuración.' };
  }
}

/**
 * Actualiza un valor de configuración.
 */
function adminActualizarConfig(token, clave, valor) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    clave = sanitize_((clave || '').trim());
    valor = sanitize_((valor || '').trim());

    const clavesPermitidas = ['registrationOpen', 'deadline', 'announcement'];
    if (clavesPermitidas.indexOf(clave) === -1) {
      return { success: false, message: 'Clave de configuración no válida: ' + clave };
    }

    // Validación específica por clave
    if (clave === 'registrationOpen' && valor !== 'TRUE' && valor !== 'FALSE') {
      return { success: false, message: 'registrationOpen debe ser TRUE o FALSE.' };
    }
    if (clave === 'deadline' && valor) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return { success: false, message: 'El deadline debe tener formato AAAA-MM-DD.' };
      }
    }

    const sheet = configSheet_();
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === clave) {
        sheet.getRange(i + 1, 2).setValue(valor);
        return { success: true, message: 'Configuración actualizada: ' + clave + ' = ' + valor };
      }
    }

    // Si la clave no existe, agregarla
    sheet.appendRow([clave, valor]);
    return { success: true, message: 'Configuración creada: ' + clave + ' = ' + valor };
  } catch (err) {
    console.error('Error en adminActualizarConfig: ' + err.message);
    return { success: false, message: 'Error al actualizar configuración.' };
  }
}

// =====================================================
// ESTADÍSTICAS GENERALES
// =====================================================

/**
 * Dashboard de estadísticas para el administrador.
 */
function adminObtenerEstadisticas(token) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();

    const stats = {
      totalProyectos: 0,
      porEstado: {},
      porMalla: { ICOM: 0, INCO: 0 },
      conDocumento: 0,
      conVideo: 0,
      totalUsuarios: 0,
      usuariosPorRol: {}
    };

    // Estadísticas de proyectos
    for (let i = 1; i < datos.length; i++) {
      stats.totalProyectos++;

      const estado = String(datos[i][col['Estado']] || 'Sin estado');
      stats.porEstado[estado] = (stats.porEstado[estado] || 0) + 1;

      const malla = String(datos[i][col['TipoMalla']] || '');
      if (malla === 'ICOM') stats.porMalla.ICOM++;
      else if (malla === 'INCO') stats.porMalla.INCO++;

      const s2 = String(datos[i][col['Seccion2_Estado']] || '');
      if (s2 === ESTADOS_SECCION.SUBIDO || s2 === ESTADOS_SECCION.APROBADO) stats.conDocumento++;

      const s3 = String(datos[i][col['Seccion3_Estado']] || '');
      if (s3 === ESTADOS_SECCION.REGISTRADO) stats.conVideo++;
    }

    // Estadísticas de usuarios
    const sheetU = usuariosSheet_();
    const datosU = sheetU.getDataRange().getValues();
    for (let i = 1; i < datosU.length; i++) {
      stats.totalUsuarios++;
      const rol = String(datosU[i][3] || 'sin_rol');
      stats.usuariosPorRol[rol] = (stats.usuariosPorRol[rol] || 0) + 1;
    }

    return { success: true, estadisticas: stats };
  } catch (err) {
    console.error('Error en adminObtenerEstadisticas: ' + err.message);
    return { success: false, message: 'Error al obtener estadísticas.' };
  }
}

// =====================================================
// EXPORTAR DATOS
// =====================================================

/**
 * Genera un resumen CSV de todos los proyectos para descarga.
 */
function adminExportarCSV(token) {
  try {
    const auth = autorizarRoles_(token, ['administrador']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    const sheet = seccion1Sheet_();
    const datos = sheet.getDataRange().getValues();

    // Construir CSV
    const lineas = datos.map(fila =>
      fila.map(celda => {
        let val = celda instanceof Date
          ? Utilities.formatDate(celda, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
          : String(celda);
        // Escapar comillas y envolver en comillas si contiene comas
        val = val.replace(/"/g, '""');
        if (val.indexOf(',') !== -1 || val.indexOf('\n') !== -1 || val.indexOf('"') !== -1) {
          val = '"' + val + '"';
        }
        return val;
      }).join(',')
    );

    return { success: true, csv: lineas.join('\n') };
  } catch (err) {
    console.error('Error en adminExportarCSV: ' + err.message);
    return { success: false, message: 'Error al exportar datos.' };
  }
}
