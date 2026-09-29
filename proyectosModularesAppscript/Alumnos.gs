/******************************************************
 * Alumnos.gs
 * Lógica de negocio para alumnos:
 * Sección 1 (registro), Sección 2 (documento),
 * Sección 3 (video), consulta de proyecto
 ******************************************************/

// =====================================================
// SECCIÓN 1 — REGISTRO DE PROYECTO
// =====================================================

/**
 * Registra un proyecto modular nuevo (Sección 1).
 * Valida duplicidad de líder y unicidad de título.
 */
function enviarSeccion1(token, formData) {
  try {
    // 1. Autorización
    const auth = autorizarRoles_(token, ['alumno']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }
    const sesion = auth.sesion;

    // 2. Verificar que el registro esté abierto
    // if (!registroAbierto_()) {
    //   return { success: false, message: 'El periodo de registro está cerrado actualmente.' };
    // }
    // if (!dentroDeDeadline_()) {
    //   return { success: false, message: 'La fecha límite de registro ha expirado.' };
    // }

    // 3. Sanitizar todos los campos
    const fd = sanitizeObject_(formData);

    // 4. Validar tipo de malla
    if (fd.tipoMalla !== 'INCO' && fd.tipoMalla !== 'ICOM') {
      return { success: false, message: 'Debes seleccionar la malla ICOM o INCO.' };
    }

    // 5. Validar campos obligatorios
    const obligatorios = {
      tituloProyecto:    'Título del proyecto',
      resumenProyecto:   'Resumen del proyecto',
      nombreLider:       'Nombre del líder',
      codigoLider:       'Código del líder',
      correoLider:       'Correo del líder',
      whatsappLider:     'WhatsApp del líder',
      semestreLider:     'Semestre del líder',
      asesor1:           'Asesor 1',
      fechaPresentacion: 'Fecha de presentación'
    };

    for (const [campo, etiqueta] of Object.entries(obligatorios)) {
      if (!fd[campo] || String(fd[campo]).trim() === '') {
        return { success: false, message: 'El campo "' + etiqueta + '" es obligatorio.' };
      }
    }

    // 6. Validar longitudes
    if (fd.tituloProyecto.length > 200) {
      return { success: false, message: 'El título no puede exceder 200 caracteres.' };
    }
    if (fd.resumenProyecto.length > 2000) {
      return { success: false, message: 'El resumen no puede exceder 2000 caracteres.' };
    }
    if (fd.codigoLider.length > 20) {
      return { success: false, message: 'El código del líder no puede exceder 20 caracteres.' };
    }

    // 7. Validar formato del código (solo dígitos y posibles letras iniciales)
    if (!/^[0-9a-zA-Z]{5,15}$/.test(fd.codigoLider)) {
      return { success: false, message: 'El código del líder debe ser alfanumérico (5-15 caracteres).' };
    }

    // 8. Validar WhatsApp (solo dígitos, 10 chars)
    const whatsappLimpio = fd.whatsappLider.replace(/[\s\-\+$$]/g, '');
    if (!/^\d{10,15}$/.test(whatsappLimpio)) {
      return { success: false, message: 'El número de WhatsApp debe tener entre 10 y 15 dígitos.' };
    }

    // 9. Validar semestre
    const semestreNum = parseInt(fd.semestreLider, 10);
    if (isNaN(semestreNum) || semestreNum < 1 || semestreNum > 15) {
      return { success: false, message: 'El semestre debe ser un número entre 1 y 15.' };
    }

    // 10. Validar fecha de presentación
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fd.fechaPresentacion)) {
      return { success: false, message: 'La fecha de presentación debe tener formato AAAA-MM-DD.' };
    }
    const fechaPres = new Date(fd.fechaPresentacion);
    if (isNaN(fechaPres.getTime())) {
      return { success: false, message: 'La fecha de presentación no es válida.' };
    }

    // 11. Verificar duplicidad (con lock)
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      const sheet = seccion1Sheet_();
      const col = mapaColumnas_(sheet);
      const datos = sheet.getDataRange().getValues();

      // 11a. Un alumno solo puede ser líder de un proyecto
      for (let i = 1; i < datos.length; i++) {
        if (String(datos[i][col['EmailLider']]).toLowerCase() === sesion.email) {
          // Verificar si el proyecto fue marcado "No aprobado" (puede reenviar)
          const estadoActual = String(datos[i][col['Estado']]);
          if (estadoActual === ESTADOS_PROYECTO.NO_APROBADO) {
            // Permitir actualización — se maneja en actualizarSeccion1
            return {
              success: false,
              message: 'Ya tienes un proyecto registrado. Como fue marcado "No aprobado", usa la función de edición para corregirlo.'
            };
          }
          return {
            success: false,
            message: 'Ya tienes un Proyecto Modular registrado con este correo. Solo puedes registrar uno.'
          };
        }
      }

      // 11b. Título único (case-insensitive, normalizado)
      const tituloNormalizado = fd.tituloProyecto.toLowerCase().replace(/\s+/g, ' ').trim();
      for (let i = 1; i < datos.length; i++) {
        const tituloExistente = String(datos[i][col['TituloProyecto']] || '')
          .toLowerCase().replace(/\s+/g, ' ').trim();
        if (tituloExistente === tituloNormalizado) {
          return {
            success: false,
            message: 'Ya existe un proyecto registrado con un título idéntico o muy similar. Elige un título diferente.'
          };
        }
      }

      // 12. Generar folio y escribir fila
      const folio = generarFolio_(fd.tipoMalla);
      const fila = new Array(sheet.getLastColumn()).fill('');

      fila[col['Folio']]             = folio;
      fila[col['Timestamp']]         = new Date();
      fila[col['EmailLider']]        = sesion.email;
      fila[col['TipoMalla']]         = fd.tipoMalla;
      fila[col['TituloProyecto']]    = fd.tituloProyecto;
      fila[col['ResumenProyecto']]   = fd.resumenProyecto;
      fila[col['NombreLider']]       = fd.nombreLider;
      fila[col['CodigoLider']]       = fd.codigoLider;
      fila[col['CorreoLider']]       = fd.correoLider;
      fila[col['WhatsappLider']]     = whatsappLimpio;
      fila[col['SemestreLider']]     = semestreNum;
      fila[col['Nombre2do']]         = fd.nombre2do || '';
      fila[col['Codigo2do']]         = fd.codigo2do || '';
      fila[col['Nombre3ro']]         = fd.nombre3ro || '';
      fila[col['Codigo3ro']]         = fd.codigo3ro || '';
      fila[col['Asesor1']]           = fd.asesor1;
      fila[col['Asesor2']]           = fd.asesor2 || '';
      fila[col['FechaPresentacion']] = fd.fechaPresentacion;
      fila[col['Estado']]            = ESTADOS_PROYECTO.REGISTRADO;
      fila[col['Seccion2_Estado']]   = ESTADOS_SECCION.PENDIENTE;
      fila[col['Seccion3_Estado']]   = ESTADOS_SECCION.PENDIENTE;

      sheet.appendRow(fila);

      // 13. Enviar correo de confirmación
      enviarCorreoConfirmacion_(sesion.email, folio, fd);

      return {
        success: true,
        message: 'Proyecto Modular registrado correctamente.',
        folio: folio
      };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('Error en enviarSeccion1: ' + err.message + '\n' + err.stack);
    return { success: false, message: 'Error interno al guardar el registro. Intenta de nuevo.' };
  }
}

// =====================================================
// ACTUALIZAR SECCIÓN 1 (proyecto devuelto)
// =====================================================

/**
 * Permite al líder actualizar su proyecto si fue marcado "No aprobado".
 */
function actualizarSeccion1(token, formData) {
  try {
    const auth = autorizarRoles_(token, ['alumno']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const numFila = buscarFilaProyecto_(auth.sesion.email);

    if (numFila === -1) {
      return { success: false, message: 'No tienes un proyecto registrado.' };
    }

    // Verificar que el estado permita edición
    const estadoActual = String(sheet.getRange(numFila, col['Estado'] + 1).getValue());
    if (estadoActual !== ESTADOS_PROYECTO.NO_APROBADO) {
      return {
        success: false,
        message: 'Solo puedes editar tu proyecto si fue marcado como "No aprobado". Estado actual: ' + estadoActual
      };
    }

    const fd = sanitizeObject_(formData);

    // Validaciones mínimas (las mismas que en enviarSeccion1)
    const obligatorios = ['tituloProyecto', 'resumenProyecto', 'nombreLider', 'codigoLider',
      'correoLider', 'whatsappLider', 'semestreLider', 'asesor1', 'fechaPresentacion'];
    for (const campo of obligatorios) {
      if (!fd[campo] || String(fd[campo]).trim() === '') {
        return { success: false, message: 'Falta un campo obligatorio: ' + campo };
      }
    }

    // Verificar unicidad de título (excluyendo su propio registro)
    const tituloNormalizado = fd.tituloProyecto.toLowerCase().replace(/\s+/g, ' ').trim();
    const datos = sheet.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (i + 1 === numFila) continue; // Saltar su propio registro
      const tituloExistente = String(datos[i][col['TituloProyecto']] || '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
      if (tituloExistente === tituloNormalizado) {
        return { success: false, message: 'Ya existe otro proyecto con un título idéntico.' };
      }
    }

    // Actualizar campos editables
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.getRange(numFila, col['TituloProyecto'] + 1).setValue(fd.tituloProyecto);
      sheet.getRange(numFila, col['ResumenProyecto'] + 1).setValue(fd.resumenProyecto);
      sheet.getRange(numFila, col['NombreLider'] + 1).setValue(fd.nombreLider);
      sheet.getRange(numFila, col['CodigoLider'] + 1).setValue(fd.codigoLider);
      sheet.getRange(numFila, col['CorreoLider'] + 1).setValue(fd.correoLider);
      sheet.getRange(numFila, col['WhatsappLider'] + 1).setValue(fd.whatsappLider);
      sheet.getRange(numFila, col['SemestreLider'] + 1).setValue(fd.semestreLider);
      sheet.getRange(numFila, col['Nombre2do'] + 1).setValue(fd.nombre2do || '');
      sheet.getRange(numFila, col['Codigo2do'] + 1).setValue(fd.codigo2do || '');
      sheet.getRange(numFila, col['Nombre3ro'] + 1).setValue(fd.nombre3ro || '');
      sheet.getRange(numFila, col['Codigo3ro'] + 1).setValue(fd.codigo3ro || '');
      sheet.getRange(numFila, col['Asesor1'] + 1).setValue(fd.asesor1);
      sheet.getRange(numFila, col['Asesor2'] + 1).setValue(fd.asesor2 || '');
      sheet.getRange(numFila, col['FechaPresentacion'] + 1).setValue(fd.fechaPresentacion);

      // Cambiar estado a "Registrado" (reenviado)
      sheet.getRange(numFila, col['Estado'] + 1).setValue(ESTADOS_PROYECTO.REGISTRADO);
      // Actualizar timestamp
      sheet.getRange(numFila, col['Timestamp'] + 1).setValue(new Date());
    } finally {
      lock.releaseLock();
    }

    return { success: true, message: 'Proyecto actualizado y reenviado correctamente.' };
  } catch (err) {
    console.error('Error en actualizarSeccion1: ' + err.message);
    return { success: false, message: 'Error al actualizar el proyecto.' };
  }
}

// =====================================================
// CONSULTA DE PROYECTO PROPIO
// =====================================================

/**
 * Devuelve el proyecto del alumno logueado, o null si no tiene.
 * Incluye retroalimentación del asesor si existe.
 */
function obtenerMiProyecto(token) {
  try {
    const sesion = validarSesion(token);
    if (!sesion) return null;

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);
    const numFila = buscarFilaProyecto_(sesion.email);
    if (numFila === -1) return null;

    const valores = sheet.getRange(numFila, 1, 1, sheet.getLastColumn()).getValues()[0];
    const proyecto = {};

    Object.keys(col).forEach(nombre => {
      let valor = valores[col[nombre]];
      if (valor instanceof Date) {
        valor = Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      }
      proyecto[nombre] = valor;
    });

    // Determinar si el formulario es editable
    proyecto._editable = (proyecto.Estado === ESTADOS_PROYECTO.NO_APROBADO);
    proyecto._seccion2Habilitada = (proyecto.Estado === ESTADOS_PROYECTO.REGISTRADO ||
                                     proyecto.Estado === ESTADOS_PROYECTO.NO_APROBADO);
    proyecto._seccion3Habilitada = (proyecto.Seccion2_Estado === ESTADOS_SECCION.SUBIDO ||
                                     proyecto.Seccion2_Estado === ESTADOS_SECCION.APROBADO);

    return proyecto;
  } catch (err) {
    console.error('Error en obtenerMiProyecto: ' + err.message);
    return null;
  }
}

/**
 * Busca la fila (1-based) del proyecto donde emailLider coincide.
 */
function buscarFilaProyecto_(emailLider) {
  const sheet = seccion1Sheet_();
  const col = mapaColumnas_(sheet);
  const datos = sheet.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][col['EmailLider']]).toLowerCase().trim() === emailLider.toLowerCase().trim()) {
      return i + 1; // 1-based
    }
  }
  return -1;
}

// =====================================================
// SECCIÓN 2 — SUBIDA DE FORMATO TERMINADO
// =====================================================

/**
 * Configuración que el frontend necesita para la Sección 2.
 */
function obtenerConfigSeccion2() {
  return {
    urlFormato: URL_FORMATO_DESCARGA,
    bibliografia: LIGAS_BIBLIOGRAFIA,
    tamanoMaxMB: TAMANO_MAX_MB_SECCION2,
    extensionesPermitidas: EXTENSIONES_PERMITIDAS
  };
}

/**
 * Sube el formato de proyecto terminado (PDF o DOCX) a la carpeta de expedientes.
 * Valida tipo de archivo, tamaño, magic bytes. Extrae metadatos de auditoría.
 */
function subirSeccion2(token, archivoBase64, nombreArchivo, mimeType) {
  try {
    // 1. Autorización
    const auth = autorizarRoles_(token, ['alumno']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    // 2. Verificar configuración de carpeta
    if (!FOLDER_ID_EXPEDIENTES || FOLDER_ID_EXPEDIENTES.indexOf('PON_AQUI') !== -1) {
      return { success: false, message: 'La carpeta de expedientes no está configurada. Contacta al administrador.' };
    }

    // 3. Verificar que tenga proyecto registrado
    const numFila = buscarFilaProyecto_(auth.sesion.email);
    if (numFila === -1) {
      return { success: false, message: 'Primero debes completar la Sección 1 (registro del proyecto).' };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);

    // 4. Verificar estado permite subida
    const estadoProyecto = String(sheet.getRange(numFila, col['Estado'] + 1).getValue());
    if (estadoProyecto !== ESTADOS_PROYECTO.REGISTRADO &&
        estadoProyecto !== ESTADOS_PROYECTO.NO_APROBADO) {
      return {
        success: false,
        message: 'No puedes subir el formato en el estado actual del proyecto: ' + estadoProyecto
      };
    }

    // 5. Validar archivo (extensión, MIME, magic bytes, tamaño)
    const validacion = validarArchivo_(archivoBase64, nombreArchivo, mimeType);
    if (!validacion.valido) {
      return { success: false, message: validacion.error };
    }

    // 6. Si ya existía un archivo previo, eliminarlo de Drive
    const archivoIdPrevio = sheet.getRange(numFila, col['Seccion2_ArchivoID'] + 1).getValue();
    if (archivoIdPrevio) {
      try {
        DriveApp.getFileById(archivoIdPrevio).setTrashed(true);
      } catch (e) {
        console.warn('No se pudo eliminar archivo previo: ' + e.message);
      }
    }

    // 7. Construir nombre de archivo seguro
    const codigoLider = String(sheet.getRange(numFila, col['CodigoLider'] + 1).getValue());
    const folio = String(sheet.getRange(numFila, col['Folio'] + 1).getValue());
    const nombreSeguro = folio + '_' +
      codigoLider.replace(/[^a-zA-Z0-9]/g, '') + '_FormatoTerminado.' +
      validacion.extension;

    // 8. Subir archivo a Drive
    const bytes = Utilities.base64Decode(archivoBase64);
    const blob = Utilities.newBlob(bytes, mimeType, nombreSeguro);
    const carpeta = DriveApp.getFolderById(FOLDER_ID_EXPEDIENTES);
    const archivo = carpeta.createFile(blob);

    // 9. Extraer metadatos para auditoría
    const metadatos = extraerMetadatos_(archivo.getId());

    // 10. Actualizar hoja de cálculo
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.getRange(numFila, col['Seccion2_ArchivoID'] + 1).setValue(archivo.getId());
      sheet.getRange(numFila, col['Seccion2_ArchivoURL'] + 1).setValue(archivo.getUrl());
      sheet.getRange(numFila, col['Seccion2_ArchivoNombre'] + 1).setValue(nombreSeguro);
      sheet.getRange(numFila, col['Seccion2_FechaSubida'] + 1).setValue(new Date());
      sheet.getRange(numFila, col['Seccion2_Estado'] + 1).setValue(ESTADOS_SECCION.SUBIDO);

      // Metadatos de auditoría
      if (col['Seccion2_MetaAutor'] !== undefined) {
        sheet.getRange(numFila, col['Seccion2_MetaAutor'] + 1).setValue(metadatos.autor);
      }
      if (col['Seccion2_MetaFechaCreacion'] !== undefined) {
        sheet.getRange(numFila, col['Seccion2_MetaFechaCreacion'] + 1).setValue(metadatos.fechaCreacion);
      }
      if (col['Seccion2_MetaUltimaModificacion'] !== undefined) {
        sheet.getRange(numFila, col['Seccion2_MetaUltimaModificacion'] + 1).setValue(metadatos.ultimaModificacion);
      }
    } finally {
      lock.releaseLock();
    }

    return {
      success: true,
      message: 'Formato subido correctamente (' + nombreSeguro + ').',
      url: archivo.getUrl(),
      metadatos: metadatos
    };
  } catch (err) {
    console.error('Error en subirSeccion2: ' + err.message + '\n' + err.stack);
    return { success: false, message: 'Error al subir el archivo. Intenta de nuevo.' };
  }
}

// =====================================================
// SECCIÓN 3 — VIDEO CORTO
// =====================================================

/**
 * Registra el link de YouTube del video del proyecto.
 */
function registrarSeccion3(token, linkVideo) {
  try {
    // 1. Autorización
    const auth = autorizarRoles_(token, ['alumno']);
    if (!auth.autorizado) {
      return { success: false, message: auth.error };
    }

    // 2. Sanitizar y validar URL
    linkVideo = sanitize_((linkVideo || '').trim());
    if (!validarURLYoutube_(linkVideo)) {
      return { success: false, message: 'El link debe ser una URL válida de YouTube (youtube.com o youtu.be).' };
    }

    // 3. Verificar proyecto existente
    const numFila = buscarFilaProyecto_(auth.sesion.email);
    if (numFila === -1) {
      return { success: false, message: 'Primero debes completar la Sección 1.' };
    }

    const sheet = seccion1Sheet_();
    const col = mapaColumnas_(sheet);

    // 4. Verificar que la Sección 2 esté completa
    const estadoS2 = String(sheet.getRange(numFila, col['Seccion2_Estado'] + 1).getValue());
    if (estadoS2 !== ESTADOS_SECCION.SUBIDO && estadoS2 !== ESTADOS_SECCION.APROBADO) {
      return {
        success: false,
        message: 'Debes subir el formato terminado (Sección 2) antes de registrar el video.'
      };
    }

    // 5. Guardar
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.getRange(numFila, col['Seccion3_LinkVideo'] + 1).setValue(linkVideo);
      sheet.getRange(numFila, col['Seccion3_FechaRegistro'] + 1).setValue(new Date());
      sheet.getRange(numFila, col['Seccion3_Estado'] + 1).setValue(ESTADOS_SECCION.REGISTRADO);
    } finally {
      lock.releaseLock();
    }

    return { success: true, message: 'Video registrado correctamente.' };
  } catch (err) {
    console.error('Error en registrarSeccion3: ' + err.message);
    return { success: false, message: 'Error al registrar el video.' };
  }
}
