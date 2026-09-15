<script>
/**
 * ============================================================
 * CUCEI COWORKING SYSTEM – Controlador Frontend
 * script.js
 * ============================================================
 */

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // MÓDULO: GasApi
  // Wrapper que convierte google.script.run en Promesas ES6
  // ──────────────────────────────────────────────────────────
  const GasApi = {
    ejecutar(nombreFuncion, ...args) {
      return new Promise((resolve, reject) => {
        if (typeof google === 'undefined' || !google.script) {
          reject(new Error(
            'google.script.run no está disponible. ' +
            'Abre la aplicación desde Google Apps Script.'
          ));
          return;
        }
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          [nombreFuncion](...args);
      });
    }
  };

  // ──────────────────────────────────────────────────────────
  // MÓDULO: AuthService
  // Gestiona autenticación y renderizado condicional de vistas
  // ──────────────────────────────────────────────────────────
  const AuthService = {
    usuario: null,

    async inicializar() {
      try {
        const info = await GasApi.ejecutar('obtenerInfoUsuario');
        this.usuario = info;
        this._renderizarVista(info);
      } catch (error) {
        console.error('[AuthService] Error al inicializar:', error);
        this._mostrarErrorCritico(
          'No se pudo conectar con el servidor. ' +
          'Verifica tu conexión y recarga la página.'
        );
      } finally {
        const pantallaGlobal = document.getElementById('pantallaGlobalCarga');
        if (pantallaGlobal) pantallaGlobal.classList.add('hidden');
      }
    },

    _renderizarVista(info) {
      const header = document.getElementById('headerPrincipal');
      if (header) header.classList.remove('hidden');

      if (!info.accesoConcedido) {
        this._mostrarVistaDenegada(info.mensaje || 'Acceso no autorizado.');
        return;
      }

      this._actualizarHeader(info);

      if (info.rol === 'admin') {
        const vista = document.getElementById('vistaAdmin');
        if (vista) vista.classList.remove('hidden');
        AdminDashboard.inicializar();
      } else {
        const vista = document.getElementById('vistaAlumno');
        if (vista) vista.classList.remove('hidden');
        StudentView.inicializar(info);
      }
    },

    _actualizarHeader(info) {
      const correoWrapper = document.getElementById('headerCorreoUsuario');
      const correoTexto   = document.getElementById('textoCorreoHeader');
      const badgeRol      = document.getElementById('headerBadgeRol');

      if (info.correo && correoTexto) {
        correoTexto.textContent = info.correo;
        if (correoWrapper) correoWrapper.classList.remove('hidden');
      }

      if (badgeRol) {
        badgeRol.classList.remove('hidden');
        if (info.rol === 'admin') {
          badgeRol.className =
            'text-xs font-bold px-2.5 py-1 rounded-full ' +
            'bg-purple-500/20 text-purple-200 border border-purple-500/30';
          badgeRol.innerHTML = 'Admin';
        } else {
          badgeRol.className =
            'text-xs font-bold px-2.5 py-1 rounded-full ' +
            'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30';
          badgeRol.innerHTML = 'Alumno';
        }
      }
    },

    _mostrarVistaDenegada(mensaje) {
      const vista = document.getElementById('vistaDenegada');
      const msgEl = document.getElementById('mensajeDenegado');
      if (msgEl) msgEl.textContent = mensaje;
      if (vista) vista.classList.remove('hidden');
    },

    _mostrarErrorCritico(texto) {
      const pantalla = document.getElementById('pantallaGlobalCarga');
      if (!pantalla) return;
      pantalla.innerHTML = `
        <div class="text-center p-6 bg-white rounded-xl shadow-xl max-w-sm">
          <i class="fa-solid fa-triangle-exclamation text-4xl text-rose-500 mb-4"></i>
          <h2 class="text-xl font-bold text-slate-800 mb-2">Error de Conexión</h2>
          <p class="text-slate-600 text-sm mb-4">${texto}</p>
          <button onclick="location.reload()" class="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-rose-700 transition-colors">
            Reintentar
          </button>
        </div>
      `;
      pantalla.classList.remove('hidden');
    }
  };

  // ──────────────────────────────────────────────────────────
  // MÓDULO: StudentView
  // Formulario de reserva, selector de fechas y horario
  // ──────────────────────────────────────────────────────────
  const StudentView = {
    fechasSeleccionadas: [],
    HORAS: [
      '08:00','08:30','09:00','09:30','10:00','10:30',
      '11:00','11:30','12:00','12:30','13:00','13:30',
      '14:00','14:30','15:00','15:30','16:00','16:30',
      '17:00','17:30','18:00','18:30','19:00','19:30','20:00'
    ],
    correoUsuario: '',

    inicializar(infoUsuario) {
      this.correoUsuario = infoUsuario.correo || '';
      this._poblarSelectores();
    },

    _poblarSelectores() {
      const selectEntrada = document.getElementById('horaEntrada');
      if (!selectEntrada) return;

      selectEntrada.innerHTML = this.HORAS.slice(0, -1)
        .map(h => `<option value="${h}">${this._formatearAmPm(h)}</option>`)
        .join('');

      this.filtrarHoraSalida();
    },

    _formatearAmPm(horaStr) {
      const [h, m] = horaStr.split(':').map(Number);
      const ampm      = h >= 12 ? 'PM' : 'AM';
      const hora12    = h % 12 || 12;
      return `${String(hora12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    },

    seleccionarRol(rol) {
      document.getElementById('inputRol').value = rol;
      document.getElementById('pantallaSelectorRol').classList.add('hidden');
      document.getElementById('contenedorFormulario').classList.remove('hidden');

      const badge       = document.getElementById('badgeRol');
      const labelCodigo = document.getElementById('labelCodigo');
      const inputCodigo = document.getElementById('codigo');
      const campoExt    = document.getElementById('campoExtension');
      const inputExt    = document.getElementById('extension');

      if (this.correoUsuario) {
        const inputCorreo = document.getElementById('correo');
        if (inputCorreo) inputCorreo.value = this.correoUsuario;
      }

      const hoy = new Date();
      const min = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
      document.getElementById('selectorFecha').min = min;

      if (rol === 'estudiante') {
        badge.className   = 'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100';
        badge.textContent = 'Estudiante';
        labelCodigo.textContent   = 'Código de Alumno:';
        inputCodigo.placeholder   = 'Ej. 218XXXXXX';
        campoExt.classList.add('hidden');
        inputExt.required = false;
        inputExt.value    = '';
      } else {
        badge.className   = 'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100';
        badge.textContent = 'Administrativo';
        labelCodigo.textContent   = 'Código de Trabajador:';
        inputCodigo.placeholder   = 'Ej. 95XXXXX';
        campoExt.classList.remove('hidden');
        inputExt.required = true;
      }
    },

    filtrarHoraSalida() {
      const entrada     = document.getElementById('horaEntrada');
      const salida      = document.getElementById('horaSalida');
      if (!entrada || !salida) return;

      const indexEntrada  = this.HORAS.indexOf(entrada.value);
      const horasFiltradas = this.HORAS.slice(indexEntrada + 1);

      salida.innerHTML = horasFiltradas
        .map(h => `<option value="${h}">${this._formatearAmPm(h)}</option>`)
        .join('');
    },

    agregarFecha() {
      const input = document.getElementById('selectorFecha');
      const valor = input.value;

      if (!valor) {
        this._mostrarToast('Selecciona una fecha en el calendario primero.', 'warn');
        return;
      }

      if (this.fechasSeleccionadas.includes(valor)) {
        input.value = '';
        return;
      }

      this.fechasSeleccionadas.push(valor);
      this._renderizarEtiquetasFechas();
      input.value = '';
    },

    eliminarFecha(fecha) {
      this.fechasSeleccionadas = this.fechasSeleccionadas.filter(f => f !== fecha);
      this._renderizarEtiquetasFechas();
    },

    _renderizarEtiquetasFechas() {
      const contenedor = document.getElementById('listaFechasAgregadas');
      if (!contenedor) return;
      contenedor.innerHTML = '';

      [...this.fechasSeleccionadas].sort().forEach(f => {
        const [yyyy, mm, dd] = f.split('-');
        const legible = `${dd}/${mm}/${yyyy}`;

        const span = document.createElement('span');
        span.className = 'inline-flex items-center gap-1.5 bg-blue-50 text-[#002f5c] text-xs font-semibold px-2.5 py-1 rounded-lg border border-blue-100 shadow-sm';
        span.innerHTML = `
          ${legible}
          <button type="button" onclick="StudentView.eliminarFecha('${f}')" class="text-blue-400 hover:text-blue-700 font-bold ml-1">×</button>
        `;
        contenedor.appendChild(span);
      });
    },

    async enviarReserva(evento) {
      evento.preventDefault();

      const btn    = document.getElementById('btnEnviar');
      const msgDiv = document.getElementById('mensajeResultado');

      if (this.fechasSeleccionadas.length === 0) {
        this._mostrarMensaje(msgDiv, 'Por favor selecciona al menos una fecha usando el calendario.', 'error');
        return;
      }

      const odsChecks = document.querySelectorAll('input[name="ods_check"]:checked');
      const odsSeleccionados = Array.from(odsChecks).map(cb => cb.value);

      const datos = {
        rol:                  document.getElementById('inputRol').value,
        coworking:            document.getElementById('inputCoworking').value,
        nombres:              document.getElementById('nombres').value.trim(),
        apellidoPaterno:      document.getElementById('apellidoPaterno').value.trim(),
        apellidoMaterno:      document.getElementById('apellidoMaterno').value.trim(),
        codigo:               document.getElementById('codigo').value.trim(),
        telefono:             document.getElementById('telefono').value.trim(),
        extension:            document.getElementById('extension').value.trim() || 'N/A',
        correo:               document.getElementById('correo').value.trim(),
        actividad:            document.getElementById('actividad').value.trim(),
        descripcionActividad: document.getElementById('descripcionActividad').value.trim(),
        fechas:               [...this.fechasSeleccionadas],
        horaEntrada:          document.getElementById('horaEntrada').value,
        horaSalida:           document.getElementById('horaSalida').value,
        ods:                  odsSeleccionados
      };

      btn.disabled   = true;
      btn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Validando y registrando…';
      this._ocultarMensaje(msgDiv);

      try {
        const resultado = await GasApi.ejecutar('registrarReserva', datos);

        if (resultado.exito) {
          this._mostrarMensaje(msgDiv, resultado.mensaje, 'exito');
          document.getElementById('formReserva').reset();
          this.fechasSeleccionadas = [];
          this._renderizarEtiquetasFechas();

          setTimeout(() => ModalController.cerrar(), 3500);
        } else {
          this._mostrarMensaje(msgDiv, resultado.mensaje, 'error');
          this._restaurarBoton(btn);
        }
      } catch (error) {
        console.error('[StudentView] Error al enviar reserva:', error);
        this._mostrarMensaje(msgDiv, 'Error de conexión: ' + (error.message || 'Inténtalo de nuevo.'), 'error');
        this._restaurarBoton(btn);
      }
    },

    _restaurarBoton(btn) {
      btn.disabled  = false;
      btn.innerHTML = 'Confirmar mi reserva';
    },

    _mostrarMensaje(el, texto, tipo) {
      if (!el) return;
      const estilos = {
        exito: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
        error: 'bg-rose-50 text-rose-800 border border-rose-200',
        warn:  'bg-amber-50 text-amber-800 border border-amber-200'
      };
      el.className = `mt-4 p-3 rounded-xl text-sm font-semibold text-center ${estilos[tipo] || estilos.error}`;
      el.textContent = texto;
      el.classList.remove('hidden');
    },

    _ocultarMensaje(el) {
      if (el) el.classList.add('hidden');
    },

    _mostrarToast(texto, tipo = 'warn') {
      const msgDiv = document.getElementById('mensajeResultado');
      this._mostrarMensaje(msgDiv, texto, tipo);
      setTimeout(() => this._ocultarMensaje(msgDiv), 3000);
    },

    resetear() {
      const form = document.getElementById('formReserva');
      if (form) form.reset();

      this.fechasSeleccionadas = [];
      this._renderizarEtiquetasFechas();

      const selectorRol = document.getElementById('pantallaSelectorRol');
      const contenedor  = document.getElementById('contenedorFormulario');
      if (selectorRol) selectorRol.classList.remove('hidden');
      if (contenedor)  contenedor.classList.add('hidden');

      document.querySelectorAll('input[name="ods_check"]')
        .forEach(cb => { cb.checked = false; });

      this._ocultarMensaje(document.getElementById('mensajeResultado'));
      this._restaurarBoton(document.getElementById('btnEnviar'));
    }
  };

  // ──────────────────────────────────────────────────────────
  // MÓDULO: ModalController
  // Controla el modal de detalle y reserva de coworkings (vista alumno)
  // ──────────────────────────────────────────────────────────
  const ModalController = {
    abrir(boton) {
      const titulo    = boton.dataset.coworking  || '';
      const desc      = boton.dataset.desc       || '';
      const capacidad = boton.dataset.cap        || '';
      const imagen    = boton.dataset.img        || '';
      let   specs     = [];

      try {
        specs = JSON.parse(boton.dataset.specs || '[]');
      } catch (e) {
        console.warn('[ModalController] Error al parsear specs:', e);
      }

      this._setTexto('modalTitulo',      titulo);
      this._setTexto('modalDescripcion', desc);
      this._setTexto('modalCapacidad',   capacidad);

      const imgEl = document.getElementById('modalImagen');
      if (imgEl) imgEl.src = imagen;

      const listaEsp = document.getElementById('modalEspecificaciones');
      if (listaEsp) {
        listaEsp.innerHTML = specs.map(item => `
          <li class="flex items-center gap-2 text-sm text-slate-600">
            <i class="fa-solid fa-check text-emerald-500"></i> ${item}
          </li>
        `).join('');
      }

      const inputCW = document.getElementById('inputCoworking');
      if (inputCW) inputCW.value = titulo;

      StudentView.resetear();

      const modal = document.getElementById('modalReserva');
      if (modal) modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    },

    cerrar() {
      const modal = document.getElementById('modalReserva');
      if (modal) modal.classList.add('hidden');
      document.body.style.overflow = 'auto';
      StudentView.resetear();
    },

    _setTexto(id, texto) {
      const el = document.getElementById(id);
      if (el) el.textContent = texto;
    }
  };

  // ──────────────────────────────────────────────────────────
  // MÓDULO: AdminDashboard
  // Dashboard de administrador: métricas, tabla, gráficas, búsqueda y modal
  // ──────────────────────────────────────────────────────────
  const AdminDashboard = {
    todasLasReservas: [],
    filtroActivo: 'todos',
    _charts: {},
    _reservaEnModal: null,

    async inicializar() {
      try {
        const datos = await GasApi.ejecutar('obtenerDashboardAdmin');

        if (!datos.exito) {
          this._mostrarErrorDashboard(datos.mensaje);
          return;
        }

        this.todasLasReservas = datos.reservas || [];

        this._renderizarMetricas(datos.metricas);
        this._renderizarGraficas(datos.graficaEstados, datos.graficaEspacios);
        this._renderizarTabla(this.todasLasReservas);

      } catch (error) {
        console.error('[AdminDashboard] Error al inicializar:', error);
        this._mostrarErrorDashboard(
          'Error al cargar el dashboard: ' + (error.message || 'Inténtalo de nuevo.')
        );
      }
    },

    _renderizarMetricas(metricas) {
      const contenedor = document.getElementById('tarjetasMetricas');
      if (!contenedor) return;

      const config = [
        { label: 'Total de Reservas', valor: metricas.total, icono: 'fa-calendar-days', color: 'text-blue-600', bg: 'bg-blue-50', borde: 'border-blue-100' },
        { label: 'Pendientes', valor: metricas.pendientes, icono: 'fa-hourglass-half', color: 'text-amber-600', bg: 'bg-amber-50', borde: 'border-amber-100' },
        { label: 'Aceptadas', valor: metricas.aceptadas, icono: 'fa-circle-check', color: 'text-emerald-600', bg: 'bg-emerald-50', borde: 'border-emerald-100' },
        { label: 'Rechazadas', valor: metricas.rechazadas, icono: 'fa-circle-xmark', color: 'text-red-600', bg: 'bg-red-50', borde: 'border-red-100' }
      ];

      contenedor.innerHTML = config.map(c => `
        <div class="p-4 rounded-xl border ${c.borde} ${c.bg} flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold text-slate-600">${c.label}</p>
            <h3 class="text-2xl font-black ${c.color} mt-1">${c.valor}</h3>
          </div>
          <div class="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-sm text-xl ${c.color}">
            <i class="fa-solid ${c.icono}"></i>
          </div>
        </div>
      `).join('');
    },

    _renderizarGraficas(dataEstados, dataEspacios) {
      Object.values(this._charts).forEach(c => { if (c) c.destroy(); });
      this._charts = {};

      const ctxEstados = document.getElementById('graficaEstados');
      if (ctxEstados && typeof Chart !== 'undefined') {
        this._charts.estados = new Chart(ctxEstados, {
          type: 'doughnut',
          data: {
            labels:   dataEstados.labels,
            datasets: [{
              data:            dataEstados.datos,
              backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
              borderColor:     ['#fff', '#fff', '#fff'],
              borderWidth:     3,
              hoverOffset:     6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: { size: 11, weight: 'bold' }, padding: 16, usePointStyle: true }
              },
              tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} reserva(s)` } }
            },
            cutout: '65%'
          }
        });
      }

      const ctxEspacios = document.getElementById('graficaEspacios');
      if (ctxEspacios && typeof Chart !== 'undefined') {
        this._charts.espacios = new Chart(ctxEspacios, {
          type: 'bar',
          data: {
            labels:   dataEspacios.labels,
            datasets: [{
              label:           'Reservas',
              data:            dataEspacios.datos,
              backgroundColor: ['rgba(0,47,92,0.80)', 'rgba(234,170,0,0.80)', 'rgba(16,185,129,0.80)', 'rgba(99,102,241,0.80)'],
              borderRadius:    8,
              borderSkipped:   false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} reserva(s)` } } },
            scales: {
              y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
              x: { ticks: { font: { size: 10 }, maxRotation: 30 }, grid: { display: false } }
            }
          }
        });
      }
    },

    _renderizarTabla(reservas) {
      const spinner       = document.getElementById('spinnerTabla');
      const contenedor    = document.getElementById('contenedorTabla');
      const cuerpo        = document.getElementById('cuerpoTabla');
      const mensajeVacio  = document.getElementById('mensajeTablaVacia');

      if (spinner)    spinner.classList.add('hidden');
      if (contenedor) contenedor.classList.remove('hidden');

      if (!cuerpo) return;

      if (reservas.length === 0) {
        cuerpo.innerHTML = '';
        if (mensajeVacio) mensajeVacio.classList.remove('hidden');
        return;
      }

      if (mensajeVacio) mensajeVacio.classList.add('hidden');

      cuerpo.innerHTML = reservas.map(r => {
        const badgeClase = this._obtenerClaseBadge(r.estado);
        const esPendiente = r.estado === 'Pendiente';

        const [yyyy, mm, dd] = (r.fecha || '').split('-');
        const fechaLegible = (yyyy && mm && dd) ? `${dd}/${mm}/${yyyy}` : r.fecha;

        // Se agregó cursor-pointer y el evento onclick a toda la fila (tr)
        return `
          <tr onclick="AdminDashboard.abrirModal('${r.idReserva}')" class="hover:bg-slate-100 transition-colors border-b border-slate-100 last:border-0 cursor-pointer">
            <td class="px-4 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
              ${r.idReserva}
            </td>
            <td class="px-4 py-3">
              <div class="font-semibold text-slate-800 text-sm">${this._escapar(r.nombreCompleto)}</div>
              <div class="text-slate-500 text-xs">${this._escapar(r.correo)}</div>
            </td>
            <td class="px-4 py-3 text-sm text-slate-700">
              ${this._escapar(r.coworking)}
            </td>
            <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
              ${fechaLegible}
            </td>
            <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
              ${r.horaInicio} – ${r.horaFin}
            </td>
            <td class="px-4 py-3">
              <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeClase}">
                ${r.estado}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              ${esPendiente
                ? `<button onclick="event.stopPropagation(); AdminDashboard.abrirModal('${r.idReserva}')" class="text-xs bg-[#002f5c] hover:bg-[#001f3f] text-white px-3 py-1.5 rounded-lg transition-colors">
                     Revisar
                   </button>`
                : `<button onclick="event.stopPropagation(); AdminDashboard.abrirModal('${r.idReserva}')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">
                     Ver detalle
                   </button>`
              }
            </td>
          </tr>
        `;
      }).join('');
    },

    filtrarPorEstado(estado) {
      this.filtroActivo = estado;
      document.querySelectorAll('.filtro-btn').forEach(btn => {
        const esteBoton = btn.dataset.filtro === estado;
        btn.className = btn.className.replace(/bg-\[\#002f5c\]|text-white|bg-slate-100|text-slate-600/g, '').trim();
        if (esteBoton) {
          btn.classList.add('bg-[#002f5c]', 'text-white');
        } else {
          btn.classList.add('bg-slate-100', 'text-slate-600');
        }
      });

      const filtradas = estado === 'todos' ? this.todasLasReservas : this.todasLasReservas.filter(r => r.estado === estado);
      this._renderizarTabla(filtradas);
    },

    abrirModal(idReserva) {
      const reserva = this.todasLasReservas.find(r => r.idReserva === idReserva);
      if (!reserva) return;

      this._reservaEnModal = reserva;

      const estadoEl = document.getElementById('modalAdminEstado');
      if (estadoEl) {
        estadoEl.className = `text-xs font-bold px-3 py-1 rounded-full ${this._obtenerClaseBadge(reserva.estado)}`;
        estadoEl.textContent = reserva.estado;
      }

      const [yyyy, mm, dd] = (reserva.fecha || '').split('-');
      const fechaLegible = (yyyy && mm && dd) ? `${dd}/${mm}/${yyyy}` : reserva.fecha;

      const detalles = [
        { label: 'ID Reserva',   valor: reserva.idReserva },
        { label: 'Espacio',      valor: reserva.coworking },
        { label: 'Fecha',        valor: fechaLegible },
        { label: 'Horario',      valor: `${reserva.horaInicio} – ${reserva.horaFin}` },
        { label: 'Solicitante',  valor: reserva.nombreCompleto },
        { label: 'Correo',       valor: reserva.correo },
        { label: 'Código',       valor: reserva.codigo },
        { label: 'Teléfono',     valor: reserva.telefono },
        { label: 'Rol',          valor: reserva.rol },
        { label: 'Actividad',    valor: reserva.actividad },
        { label: 'Registrado',   valor: reserva.fechaRegistro }
      ];

      const detallesEl = document.getElementById('modalAdminDetalles');
      if (detallesEl) {
        detallesEl.innerHTML = detalles.map(d => `
          <div>
            <span class="block text-xs font-semibold text-slate-500 mb-1">${d.label}</span>
            <span class="block text-sm text-slate-800">${this._escapar(d.valor)}</span>
          </div>
        `).join('');
      }

      this._setTextoModal('modalAdminOds',  reserva.ods || 'No especificado');
      this._setTextoModal('modalAdminDesc', reserva.descripcion || 'Sin descripción');

      this._renderizarBotonesModal(reserva);

      const modal = document.getElementById('modalDetalleAdmin');
      if (modal) modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    },

    _renderizarBotonesModal(reserva) {
      const accionesEl = document.getElementById('modalAdminAcciones');
      if (!accionesEl) return;

      if (reserva.estado === 'Pendiente') {
        accionesEl.innerHTML = `
          <button onclick="AdminDashboard.cambiarEstado('${this._escId(reserva.idReserva)}', 'Rechazada')" class="flex-1 bg-white border-2 border-rose-100 text-rose-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-50 transition-colors">
            <i class="fa-solid fa-xmark mr-2"></i> Rechazar
          </button>
          <button onclick="AdminDashboard.cambiarEstado('${this._escId(reserva.idReserva)}', 'Aceptada')" class="flex-1 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-500/20">
            <i class="fa-solid fa-check mr-2"></i> Aprobar
          </button>
        `;
      } else if (reserva.estado === 'Aceptada') {
        accionesEl.innerHTML = `<div class="w-full text-center p-3 bg-emerald-50 text-emerald-800 rounded-xl text-sm font-semibold border border-emerald-100">Esta reserva ya fue aprobada y no puede modificarse.</div>`;
      } else {
        accionesEl.innerHTML = `<div class="w-full text-center p-3 bg-rose-50 text-rose-800 rounded-xl text-sm font-semibold border border-rose-100">Esta reserva fue rechazada y no puede modificarse.</div>`;
      }
    },

    cerrarModal() {
      const modal = document.getElementById('modalDetalleAdmin');
      if (modal) modal.classList.add('hidden');
      document.body.style.overflow = 'auto';
      this._reservaEnModal = null;
    },

    async cambiarEstado(idReserva, nuevoEstado) {
      const accionesEl = document.getElementById('modalAdminAcciones');

      if (accionesEl) {
        accionesEl.innerHTML = `<div class="w-full text-center p-3 text-slate-500 text-sm font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Procesando…</div>`;
      }

      try {
        const resultado = await GasApi.ejecutar('actualizarEstadoReserva', idReserva, nuevoEstado);

        if (resultado.exito) {
          const idx = this.todasLasReservas.findIndex(r => r.idReserva === idReserva);
          if (idx !== -1) this.todasLasReservas[idx].estado = nuevoEstado;

          if (accionesEl) {
            accionesEl.innerHTML = `<div class="w-full text-center p-3 bg-emerald-50 text-emerald-800 rounded-xl text-sm font-semibold">${resultado.mensaje}</div>`;
          }

          const estadoEl = document.getElementById('modalAdminEstado');
          if (estadoEl) {
            estadoEl.className = `text-xs font-bold px-3 py-1 rounded-full ${this._obtenerClaseBadge(nuevoEstado)}`;
            estadoEl.textContent = nuevoEstado;
          }

          setTimeout(() => {
            this.cerrarModal();
            this.filtrarPorEstado(this.filtroActivo);
          }, 2000);
        } else {
          if (accionesEl) {
            accionesEl.innerHTML = `<div class="w-full text-center p-3 bg-rose-50 text-rose-800 rounded-xl text-sm font-semibold">${resultado.mensaje}</div>`;
          }
          if (this._reservaEnModal) {
            setTimeout(() => this._renderizarBotonesModal(this._reservaEnModal), 3000);
          }
        }
      } catch (error) {
        if (accionesEl) {
          accionesEl.innerHTML = `<div class="w-full text-center p-3 bg-rose-50 text-rose-800 rounded-xl text-sm font-semibold">Error de conexión: ${error.message || 'Inténtalo de nuevo.'}</div>`;
        }
        if (this._reservaEnModal) {
          setTimeout(() => this._renderizarBotonesModal(this._reservaEnModal), 3000);
        }
      }
    },

    async buscar() {
      const inputEl     = document.getElementById('inputBusqueda');
      const resultadoEl = document.getElementById('resultadoBusqueda');
      const query       = inputEl ? inputEl.value.trim() : '';

      if (!query) {
        this._mostrarResultadoBusqueda(resultadoEl, '<div class="p-4 text-center text-slate-500 text-sm">Escribe un correo para buscar.</div>');
        return;
      }

      this._mostrarResultadoBusqueda(resultadoEl, `<div class="p-4 text-center text-slate-500 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Buscando reservas…</div>`);

      try {
        const resultado = await GasApi.ejecutar('buscarReservasPorCorreo', query);

        if (!resultado.exito) {
          this._mostrarResultadoBusqueda(resultadoEl, `<div class="p-4 text-center text-rose-600 text-sm font-semibold">${resultado.mensaje}</div>`);
          return;
        }

        if (resultado.reservas.length === 0) {
          this._mostrarResultadoBusqueda(resultadoEl, `<div class="p-4 text-center text-slate-500 text-sm">${resultado.mensaje}</div>`);
          return;
        }

        const html = `
          <div class="p-3 bg-blue-50 text-[#002f5c] text-sm font-bold border-b border-blue-100">
            ${resultado.mensaje}
          </div>
          <div class="max-h-60 overflow-y-auto">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th class="p-2 font-semibold">ID</th>
                  <th class="p-2 font-semibold">Espacio</th>
                  <th class="p-2 font-semibold">Fecha</th>
                  <th class="p-2 font-semibold">Horario</th>
                  <th class="p-2 font-semibold text-center">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${resultado.reservas.map(r => {
                  const [yyyy, mm, dd] = (r.fecha || '').split('-');
                  const fecha = (yyyy && mm && dd) ? `${dd}/${mm}/${yyyy}` : r.fecha;
                  return `
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="p-2 text-xs font-mono text-slate-500">${r.idReserva}</td>
                      <td class="p-2 text-sm text-slate-800">${this._escapar(r.coworking)}</td>
                      <td class="p-2 text-sm text-slate-600">${fecha}</td>
                      <td class="p-2 text-sm text-slate-600 font-medium">${r.horaInicio} – ${r.horaFin}</td>
                      <td class="p-2 text-center">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${this._obtenerClaseBadge(r.estado)}">
                          ${r.estado}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
        this._mostrarResultadoBusqueda(resultadoEl, html);

      } catch (error) {
        this._mostrarResultadoBusqueda(resultadoEl, `<div class="p-4 text-center text-rose-600 text-sm font-semibold">Error de conexión: ${error.message || 'Inténtalo de nuevo.'}</div>`);
      }
    },

    limpiarBusqueda() {
      const input     = document.getElementById('inputBusqueda');
      const resultado = document.getElementById('resultadoBusqueda');
      if (input)     input.value = '';
      if (resultado) {
        resultado.classList.add('hidden');
        resultado.innerHTML = '';
      }
    },

    _mostrarResultadoBusqueda(el, html) {
      if (!el) return;
      el.innerHTML = html;
      el.classList.remove('hidden');
    },

    async recargar() {
      const spinner    = document.getElementById('spinnerTabla');
      const contenedor = document.getElementById('contenedorTabla');
      if (spinner)    { spinner.classList.remove('hidden'); }
      if (contenedor) { contenedor.classList.add('hidden'); }

      this.todasLasReservas = [];
      this.filtroActivo     = 'todos';

      await this.inicializar();
    },

    _mostrarErrorDashboard(mensaje) {
      const spinner    = document.getElementById('spinnerTabla');
      const contenedor = document.getElementById('contenedorTabla');
      if (spinner) spinner.classList.add('hidden');
      if (contenedor) {
        contenedor.classList.remove('hidden');
        contenedor.innerHTML = `
          <div class="p-8 text-center bg-rose-50 rounded-xl border border-rose-100">
            <i class="fa-solid fa-circle-exclamation text-3xl text-rose-500 mb-3"></i>
            <p class="text-rose-800 font-semibold mb-4">${mensaje}</p>
            <button onclick="AdminDashboard.recargar()" class="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-rose-700">
              Reintentar
            </button>
          </div>
        `;
      }
    },

    _obtenerClaseBadge(estado) {
      const clases = {
        'Pendiente': 'badge-pendiente',
        'Aceptada':  'badge-aceptada',
        'Rechazada': 'badge-rechazada'
      };
      return clases[estado] || 'bg-slate-100 text-slate-600 border border-slate-200';
    },

    _escapar(valor) {
      return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    _escId(id) {
      return String(id).replace(/'/g, "\\'");
    },

    _setTextoModal(id, texto) {
      const el = document.getElementById(id);
      if (el) el.textContent = texto;
    }
  };

  // ──────────────────────────────────────────────────────────
  // INICIALIZACIÓN GLOBAL
  // ──────────────────────────────────────────────────────────
  global.GasApi          = GasApi;
  global.AuthService     = AuthService;
  global.StudentView     = StudentView;
  global.ModalController = ModalController;
  global.AdminDashboard  = AdminDashboard;

  document.addEventListener('DOMContentLoaded', () => {
    AuthService.inicializar();
  });

})(window);

</script>
