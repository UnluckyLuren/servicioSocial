/******************************************************
 * Config.gs
 * Constantes globales y configuración central
 ******************************************************/

// ID del Google Sheet "REGISTROS_MODULARES2026B"
const SPREADSHEET_ID = ' 1hheqrThPL_4QQmUq6V4IF2J7J5ZG86EkKPL7c5r_C3s';

// Duración de sesión en segundos (6 horas)
const SESSION_DURATION = 21600;

// Nombres de hojas
const SHEET_USUARIOS    = 'Usuarios';
const SHEET_SECCION1    = 'Registros_Seccion1';
const SHEET_CONFIG      = 'Config';
const SHEET_PROYECTOS   = 'Proyectos';

// Ciclo escolar
const CICLO_ESCOLAR = '2026B';

// Dominios permitidos → rol
const DOMINIOS_ROL = {
  'alumnos.udg.mx':    'alumno',
  'cucei.udg.mx':      'administrador',
  'academicos.udg.mx': 'academico'
};

// Carpeta de expedientes en Drive
const FOLDER_ID_EXPEDIENTES = '1DKfU45oL-hrBcr-5Leynanyz2EXzvSe-';

// URL de descarga de plantilla
const URL_FORMATO_DESCARGA = '';

// Bibliografía de apoyo
const LIGAS_BIBLIOGRAFIA = [];

// Tamaño máximo archivo Sección 2 (MB)
const TAMANO_MAX_MB_SECCION2 = 10;

// MIME types permitidos para subida de documentos
const MIME_TYPES_PERMITIDOS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

// Extensiones permitidas
const EXTENSIONES_PERMITIDAS = ['pdf', 'docx'];

// Magic bytes para verificación de tipo real de archivo
const MAGIC_BYTES = {
  'pdf':  [0x25, 0x50, 0x44, 0x46],           // %PDF
  'docx': [0x50, 0x4B, 0x03, 0x04]            // PK (ZIP header, DOCX es ZIP)
};

// Encabezados completos de Registros_Seccion1
const ENCABEZADOS_SECCION1 = [
  'Folio', 'Timestamp', 'EmailLider', 'TipoMalla', 'TituloProyecto',
  'ResumenProyecto', 'NombreLider', 'CodigoLider', 'CorreoLider',
  'WhatsappLider', 'SemestreLider', 'Nombre2do', 'Codigo2do',
  'Nombre3ro', 'Codigo3ro', 'Asesor1', 'Asesor2', 'FechaPresentacion',
  'Estado',
  // Sección 2
  'Seccion2_ArchivoID', 'Seccion2_ArchivoURL', 'Seccion2_ArchivoNombre',
  'Seccion2_FechaSubida', 'Seccion2_Estado',
  // Sección 3
  'Seccion3_LinkVideo', 'Seccion3_FechaRegistro', 'Seccion3_Estado',
  // Retroalimentación de asesores
  'Asesor_Evaluador', 'Asesor_Puntaje', 'Asesor_Observaciones',
  'Asesor_ObsDocumento', 'Asesor_ObsVideo', 'Asesor_FechaEvaluacion',
  // Metadatos del archivo subido (auditoría)
  'Seccion2_MetaAutor', 'Seccion2_MetaFechaCreacion', 'Seccion2_MetaUltimaModificacion'
];

// Estados válidos del proyecto
const ESTADOS_PROYECTO = {
  REGISTRADO:    'Registrado',
  EN_REVISION:   'En revisión',
  APROBADO:      'Aprobado',
  NO_APROBADO:   'No aprobado',
  COMPLETADO:    'Completado'
};

// Estados válidos para secciones 2 y 3
const ESTADOS_SECCION = {
  PENDIENTE:  'Pendiente',
  SUBIDO:     'Subido',
  REGISTRADO: 'Registrado',
  APROBADO:   'Aprobado',
  RECHAZADO:  'Rechazado'
};
