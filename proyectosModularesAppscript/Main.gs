/******************************************************
 * Main.gs
 * Punto de entrada de la Web App (doGet),
 * include para archivos parciales HTML
 ******************************************************/

// =====================================================
// ENTRADA WEB APP
// =====================================================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Registro de Proyectos Modulares · ICOM/INCO · CUCEI · ' + CICLO_ESCOLAR)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluye archivos parciales HTML/CSS/JS.
 * Uso en Index.html:
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =====================================================
// FUNCIONES PÚBLICAS EXPUESTAS AL FRONTEND
// (google.script.run puede llamar funciones globales)
// =====================================================

// Las funciones públicas ya están definidas en sus módulos:
//
// Auth.gs:
//   - registrarUsuario(data)
//   - iniciarSesion(email, password)
//   - validarSesion(token)
//   - cerrarSesion(token)
//
// Alumnos.gs:
//   - enviarSeccion1(token, formData)
//   - actualizarSeccion1(token, formData)
//   - obtenerMiProyecto(token)
//   - obtenerConfigSeccion2()
//   - subirSeccion2(token, base64, nombre, mime)
//   - registrarSeccion3(token, link)
//
// Asesores.gs:
//   - obtenerProyectosAsesor(token)
//   - obtenerProyectoPorFolioAsesor(token, folio)
//   - evaluarProyecto(token, evaluacion)
//   - obtenerEstadisticasAsesor(token)
//
// Admin.gs:
//   - adminListarProyectos(token, filtros)
//   - adminObtenerProyecto(token, folio)
//   - adminCambiarEstado(token, folio, estado, obs)
//   - adminEliminarProyecto(token, folio)
//   - adminListarUsuarios(token)
//   - adminEliminarUsuario(token, email)
//   - adminObtenerConfig(token)
//   - adminActualizarConfig(token, clave, valor)
//   - adminObtenerEstadisticas(token)
//   - adminExportarCSV(token)

// =====================================================
// FUNCIONES DE UTILIDAD PÚBLICA
// =====================================================

/**
 * Obtiene el anuncio configurado (si existe).
 * Disponible sin autenticación.
 */
function obtenerAnuncio() {
  try {
    return obtenerConfig_('announcement') || '';
  } catch (e) {
    return '';
  }
}

/**
 * Verifica si el registro está abierto.
 * Disponible sin autenticación.
 */
function verificarRegistroAbierto() {
  try {
    return {
      abierto: registroAbierto_(),
      dentroDeadline: dentroDeDeadline_(),
      deadline: obtenerConfig_('deadline') || ''
    };
  } catch (e) {
    return { abierto: false, dentroDeadline: false, deadline: '' };
  }
}
