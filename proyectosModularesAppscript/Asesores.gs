/******************************************************
 * Asesores.gs
 * Lógica para asesores académicos:
 * Ver proyectos asignados, evaluar, retroalimentar
 ******************************************************/

// =====================================================
// CONSULTA DE PROYECTOS ASIGNADOS
// =====================================================

/**
 * Devuelve la lista de proyectos donde el asesor logueado
 * aparece como Asesor1 o Asesor2.
 */
function obtenerProyectosAsesor(token) {
  try {
    const auth = autorizarRoles_(token, ['academico']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error, proyectos: [] };
    }

    const emailAsesor = auth.sesion.email;
    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();
    const proyectos = [];

    for (let i = 1; i < datos.length; i++) {
      const asesor1 = String(datos[i][col['Asesor1']] || '').toLowerCase().trim();
      const asesor2 = String(datos[i][col['Asesor2']] || '').toLowerCase().trim();

      // Buscar coincidencia por email o por nombre (flexibilidad)
      const esAsesor = (asesor1 === emailAsesor || asesor2 === emailAsesor ||
                        asesor1.indexOf(emailAsesor.split('@')[0]) !== -1 ||
                        asesor2.indexOf(emailAsesor.split('@')[0]) !== -1);

      if (esAsesor) {
        const proyecto = {};
        Object.keys(col).forEach(nombre => {
          let valor = datos[i][col[nombre]];
          if (valor instanceof Date) {
            valor = Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          }
          proyecto[nombre] = valor;
        });
        proyecto._filaIndex = i + 1; // 1-based, para referencia interna
        proyectos.push(proyecto);
      }
    }

    return { success: true, proyectos: proyectos };
  } catch (err) {
    console.error('Error en obtenerProyectosAsesor: ' + err.message);
    return { success: false, message: 'Error al obtener proyectos.', proyectos: [] };
  }
}

/**
 * Devuelve un proyecto específico por folio (para asesores).
 */
function obtenerProyectoPorFolioAsesor(token, folio) {
  try {
    const auth = autorizarRoles_(token, ['academico']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    folio = sanitize_((folio || '').trim());
    if (!folio) {
      return { success: false, message: 'El folio es obligatorio.' };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][col['Folio']]).trim() === folio) {
        // Verificar que este asesor tiene acceso a este proyecto
        const asesor1 = String(datos[i][col['Asesor1']] || '').toLowerCase().trim();
        const asesor2 = String(datos[i][col['Asesor2']] || '').toLowerCase().trim();
        const emailAsesor = auth.sesion.email;

        const tieneAcceso = (asesor1 === emailAsesor || asesor2 === emailAsesor ||
                             asesor1.indexOf(emailAsesor.split('@')[0]) !== -1 ||
                             asesor2.indexOf(emailAsesor.split('@')[0]) !== -1);

        if (!tieneAcceso) {
          return { success: false, message: 'No tienes acceso a este proyecto.' };
        }

        const proyecto = {};
        Object.keys(col).forEach(nombre => {
          let valor = datos[i][col[nombre]];
          if (valor instanceof Date) {
            valor = Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          }
          proyecto[nombre] = valor;
        });

        return { success: true, proyecto: proyecto };
      }
    }

    return { success: false, message: 'No se encontró un proyecto con ese folio.' };
  } catch (err) {
    console.error('Error en obtenerProyectoPorFolioAsesor: ' + err.message);
    return { success: false, message: 'Error al buscar el proyecto.' };
  }
}

// =====================================================
// EVALUACIÓN DE PROYECTO
// =====================================================

/**
 * Registra la evaluación de un asesor sobre un proyecto.
 * Si el estado es "No aprobado", desbloquea el formulario para el alumno.
 *
 * @param {string} token
 * @param {Object} evaluacion - {
 *   folio: string,
 *   estado: 'Aprobado' | 'No aprobado' | 'En revisión',
 *   puntaje: number (0-100),
 *   observaciones: string,
 *   obsDocumento: string,
 *   obsVideo: string
 * }
 */
function evaluarProyecto(token, evaluacion) {
  try {
    // 1. Autorización
    const auth = autorizarRoles_(token, ['academico']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    // 2. Sanitizar
    const ev = sanitizeObject_(evaluacion);

    // 3. Validar campos
    if (!ev.folio) {
      return { success: false, message: 'El folio del proyecto es obligatorio.' };
    }

    const estadosPermitidos = [
      ESTADOS_PROYECTO.EN_REVISION,
      ESTADOS_PROYECTO.APROBADO,
      ESTADOS_PROYECTO.NO_APROBADO
    ];
    if (estadosPermitidos.indexOf(ev.estado) === -1) {
      return {
        success: false,
        message: 'Estado no válido. Use: ' + estadosPermitidos.join(', ')
      };
    }

    // Validar puntaje
    const puntaje = ev.puntaje !== undefined && ev.puntaje !== '' ? Number(ev.puntaje) : null;
    if (puntaje !== null && (isNaN(puntaje) || puntaje < 0 || puntaje > 100)) {
      return { success: false, message: 'El puntaje debe ser un número entre 0 y 100.' };
    }

    // 4. Buscar proyecto por folio
    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const datos = sheet.getDataRange().getValues();
    let numFila = -1;
    let emailLider = '';

    for (let i = 1; i < datos.length; i++) {
      if (String(datos[i][col['Folio']]).trim() === ev.folio) {
        numFila = i + 1;
        emailLider = String(datos[i][col['EmailLider']]);

        // Verificar acceso del asesor
        const asesor1 = String(datos[i][col['Asesor1']] || '').toLowerCase().trim();
        const asesor2 = String(datos[i][col['Asesor2']] || '').toLowerCase().trim();
        const emailAsesor = auth.sesion.email;

        const tieneAcceso = (asesor1 === emailAsesor || asesor2 === emailAsesor ||
                             asesor1.indexOf(emailAsesor.split('@')[0]) !== -1 ||
                             asesor2.indexOf(emailAsesor.split('@')[0]) !== -1);

        if (!tieneAcceso) {
          return { success: false, message: 'No tienes permiso para evaluar este proyecto.' };
        }
        break;
      }
    }

    if (numFila === -1) {
      return { success: false, message: 'No se encontró un proyecto con el folio: ' + ev.folio };
    }

    // 5. Escribir evaluación
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.getRange(numFila, col['Estado'] + 1).setValue(ev.estado);
      sheet.getRange(numFila, col['Asesor_Evaluador'] + 1).setValue(auth.sesion.email);
      sheet.getRange(numFila, col['Asesor_Puntaje'] + 1).setValue(puntaje !== null ? puntaje : '');
      sheet.getRange(numFila, col['Asesor_Observaciones'] + 1).setValue(ev.observaciones || '');
      sheet.getRange(numFila, col['Asesor_ObsDocumento'] + 1).setValue(ev.obsDocumento || '');
      sheet.getRange(numFila, col['Asesor_ObsVideo'] + 1).setValue(ev.obsVideo || '');
      sheet.getRange(numFila, col['Asesor_FechaEvaluacion'] + 1).setValue(new Date());

      // Si se marca "No aprobado", resetear secciones 2 y 3 para permitir reenvío
      if (ev.estado === ESTADOS_PROYECTO.NO_APROBADO) {
        sheet.getRange(numFila, col['Seccion2_Estado'] + 1).setValue(ESTADOS_SECCION.PENDIENTE);
        sheet.getRange(numFila, col['Seccion3_Estado'] + 1).setValue(ESTADOS_SECCION.PENDIENTE);
      }
    } finally {
      lock.releaseLock();
    }

    // 6. Notificar al alumno
    enviarCorreoEvaluacion_(emailLider, ev.folio, ev.estado, ev.observaciones || '');

    return {
      success: true,
      message: 'Evaluación registrada correctamente para el proyecto ' + ev.folio + '.'
    };
  } catch (err) {
    console.error('Error en evaluarProyecto: ' + err.message + '\n' + err.stack);
    return { success: false, message: 'Error al registrar la evaluación.' };
  }
}

/**
 * Obtiene estadísticas resumidas de los proyectos asignados al asesor.
 */
function obtenerEstadisticasAsesor(token) {
  try {
    const resultado = obtenerProyectosAsesor(token);
    if (!resultado.success) return resultado;

    const proyectos = resultado.proyectos;
    const stats = {
      total: proyectos.length,
      registrados: 0,
      enRevision: 0,
      aprobados: 0,
      noAprobados: 0,
      conDocumento: 0,
      conVideo: 0
    };

    for (const p of proyectos) {
      switch (p.Estado) {
        case ESTADOS_PROYECTO.REGISTRADO:  stats.registrados++; break;
        case ESTADOS_PROYECTO.EN_REVISION: stats.enRevision++; break;
        case ESTADOS_PROYECTO.APROBADO:    stats.aprobados++; break;
        case ESTADOS_PROYECTO.NO_APROBADO: stats.noAprobados++; break;
      }
      if (p.Seccion2_Estado === ESTADOS_SECCION.SUBIDO ||
          p.Seccion2_Estado === ESTADOS_SECCION.APROBADO) stats.conDocumento++;
      if (p.Seccion3_Estado === ESTADOS_SECCION.REGISTRADO) stats.conVideo++;
    }

    return { success: true, estadisticas: stats };
  } catch (err) {
    console.error('Error en obtenerEstadisticasAsesor: ' + err.message);
    return { success: false, message: 'Error al calcular estadísticas.' };
  }
}
