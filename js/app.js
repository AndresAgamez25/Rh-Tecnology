// ─────────────────────────────────────────────────────────────
// APP: punto de arranque. Conecta datos + clasificador + interfaz.
// ─────────────────────────────────────────────────────────────
import * as datos from './datos.js';
import { clasificar } from './clasificador.js';
import { normalizarClasificacion } from './categorias.js';
import { cargarConfig, crearCliente } from './supabase.js';
import * as auth from './auth.js';
import { procesarConIA, configurarIA } from './ia.js';
import * as media from './media.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

// ── Diagnóstico: abre la app con ?debug para ver paso a paso qué pasa ──
const DEBUG = new URLSearchParams(location.search).has('debug');
const panelDebug = DEBUG ? document.body.appendChild(Object.assign(document.createElement('pre'), { className: 'panel-debug' })) : null;
function log(...partes) {
  if (!panelDebug) return;
  const hora = new Date().toLocaleTimeString('es-CO');
  panelDebug.textContent += `${hora} ${partes.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'object' ? JSON.stringify(p) : String(p))).join(' ')}\n`;
}
if (DEBUG) {
  const errorOriginal = console.error.bind(console);
  console.error = (...a) => { log('❌', ...a); errorOriginal(...a); };
  const avisoOriginal = console.warn.bind(console);
  console.warn = (...a) => { log('⚠️', ...a); avisoOriginal(...a); };
  window.addEventListener('error', (e) => log('❌ error:', e.message, e.filename?.split('/').pop(), e.lineno));
  window.addEventListener('unhandledrejection', (e) => log('❌ promesa:', e.reason));
  log('debug activo · vista:', document.body.dataset.vista);
}
const elementos = {
  pestanas: $('pestanas'),
  lista: $('lista'),
  barra: $('barra'),
  texto: $('texto'),
  enviar: $('btn-enviar'),
  reiniciar: $('btn-reiniciar'),
  audio: $('btn-audio'),
  foto: $('input-foto'),
  usuario: $('usuario-nombre'),
  salir: $('btn-salir'),
  formLogin: $('form-login'),
  email: $('login-email'),
  password: $('login-password'),
  errorLogin: $('login-error'),
  btnLogin: $('btn-login'),
  terminar: $('btn-terminar'),
  guardarCompras: $('btn-guardar-compras'),
  sinGuardar: $('compras-sin-guardar'),
  progreso: $('compras-progreso'),
  cancelarAudio: $('btn-cancelar-audio'),
  fotoBoton: $('btn-foto'),
  barraProgreso: $('compras-barra'),
};

// Estado de la app: una sola fuente de verdad
const estado = {
  items: [],
  pestana: leerPestana(),
  enviando: false,
  modo: 'demo',      // 'demo' | 'supabase' (con IA)
  usuarioId: null,   // usuario con sesión (para ignorar avisos repetidos)
  grabacion: null,   // grabación de audio en curso
  // Modo compras: momento en que empezó la salida (null = no estamos comprando)
  comprasDesde: leerCompras(),
  // Marcas aún no guardadas: { idProducto: 'comprado' | 'no_conseguido' | 'pendiente' }
  borrador: leerBorrador(),
  guardando: false,
};

// ── Render ───────────────────────────────────────────────────

function render() {
  document.body.dataset.modo = estado.comprasDesde ? 'compras' : 'lista';
  if (estado.comprasDesde) {
    renderCompras();
    return;
  }
  ui.actualizarPestanas(elementos.pestanas, estado.items, estado.pestana);
  ui.dibujarLista(elementos.lista, estado.items, estado.pestana, {
    onLlego: marcarLlego,
    onCompras: entrarACompras,
    instalar: debeMostrarInstalar() ? { onInstalar: instalarApp, onCerrar: cerrarAvisoInstalar } : null,
  });
}

function renderCompras() {
  limpiarBorrador();
  const r = ui.resumenCompras(estado.items, estado.comprasDesde, estado.borrador);
  const total = r.comprado + r.no_conseguido + r.pendiente;
  elementos.progreso.textContent = total
    ? `${r.comprado} comprados · ${r.no_conseguido} no había · ${r.pendiente} por revisar`
    : 'Nada por comprar';
  elementos.barraProgreso.style.width = `${total ? Math.round(((total - r.pendiente) / total) * 100) : 0}%`;

  const cambios = Object.keys(estado.borrador).length;
  elementos.guardarCompras.disabled = cambios === 0 || estado.guardando;
  elementos.guardarCompras.textContent = estado.guardando ? 'Guardando…' : 'Guardar cambios';
  elementos.sinGuardar.textContent = cambios
    ? `${cambios} ${cambios === 1 ? 'cambio' : 'cambios'} sin guardar`
    : 'Todo guardado ✓';

  ui.dibujarCompras(elementos.lista, estado.items, estado.comprasDesde, {
    borrador: estado.borrador,
    onMarcar: marcarEnBorrador,
  });
}

function cambiarPestana(id) {
  estado.pestana = id;
  try { localStorage.setItem('rh-pestana', id); } catch { /* sin almacenamiento */ }
  render();
  window.scrollTo({ top: 0 });
}

// ── Modo compras ─────────────────────────────────────────────
// Se guarda en el celular, así si se cierra la app en plena compra
// (pasa mucho en iPhone) se vuelve a abrir en el Modo compras.

function leerCompras() {
  try { return Number(localStorage.getItem('rh-compras-desde')) || null; } catch { return null; }
}

function guardarCompras(valor) {
  try {
    if (valor) localStorage.setItem('rh-compras-desde', String(valor));
    else localStorage.removeItem('rh-compras-desde');
  } catch { /* sin almacenamiento */ }
}

function entrarACompras() {
  estado.comprasDesde = Date.now();
  guardarCompras(estado.comprasDesde);
  render();
  window.scrollTo({ top: 0 });
}

async function terminarCompras() {
  const pendientes = Object.keys(estado.borrador).length;
  if (pendientes) {
    const guardar = await ui.confirmar({
      titulo: 'Tienes cambios sin guardar',
      mensaje: `Hay ${pendientes} ${pendientes === 1 ? 'marca' : 'marcas'} sin guardar. ¿Guardarlas antes de terminar?`,
      textoAceptar: 'Guardar',
      peligro: false,
    });
    if (!guardar || !(await guardarCambiosCompras())) return;
  }
  const r = ui.resumenCompras(estado.items, estado.comprasDesde);
  const partes = [
    `Compraste ${r.comprado}.`,
    r.no_conseguido === 1 ? '1 no se consiguió: sigue en la lista para la próxima vez.' : '',
    r.no_conseguido > 1 ? `${r.no_conseguido} no se consiguieron: siguen en la lista para la próxima vez.` : '',
    r.pendiente === 1 ? '1 quedó sin revisar.' : '',
    r.pendiente > 1 ? `${r.pendiente} quedaron sin revisar.` : '',
  ];
  const ok = await ui.confirmar({
    titulo: '¿Terminar las compras?',
    mensaje: partes.filter(Boolean).join(' '),
    textoAceptar: 'Terminar',
    peligro: false,
  });
  if (!ok) return;
  estado.comprasDesde = null;
  guardarCompras(null);
  render();
  window.scrollTo({ top: 0 });
  ui.toast('Compras terminadas. Lo comprado sale como "🛒 Comprado" hasta que llegue.', 4500);
}

// ── Borrador del Modo compras ────────────────────────────────

function leerBorrador() {
  try { return JSON.parse(localStorage.getItem('rh-compras-borrador') || '{}') || {}; } catch { return {}; }
}

function guardarBorradorLocal() {
  try { localStorage.setItem('rh-compras-borrador', JSON.stringify(estado.borrador)); } catch { /* sin almacenamiento */ }
}

/** Quita del borrador productos que ya no existen o que ya coinciden con lo guardado. */
function limpiarBorrador() {
  const porId = new Map(estado.items.map((it) => [it.id, it]));
  let cambio = false;
  for (const [id, valor] of Object.entries(estado.borrador)) {
    const item = porId.get(id);
    if (!item || valor === ui.estadoGuardado(item, estado.comprasDesde)) {
      delete estado.borrador[id];
      cambio = true;
    }
  }
  if (cambio) guardarBorradorLocal();
}

/**
 * Tocar "Comprado" o "No hay" marca la tarjeta; tocar el MISMO botón otra
 * vez la desmarca. Nada va a la base hasta "Guardar cambios".
 */
function marcarEnBorrador(item, tocado) {
  const guardado = ui.estadoGuardado(item, estado.comprasDesde);
  const actual = estado.borrador[item.id] ?? guardado;
  const nuevo = actual === tocado ? 'pendiente' : tocado;
  if (nuevo === guardado) delete estado.borrador[item.id];
  else estado.borrador[item.id] = nuevo;
  guardarBorradorLocal();
  render();
}

async function guardarCambiosCompras() {
  const cambios = Object.entries(estado.borrador);
  if (!cambios.length || estado.guardando) return true;
  estado.guardando = true;
  render();
  try {
    // Un envío por cada estado (máximo 3)
    for (const valor of ['comprado', 'no_conseguido', 'pendiente']) {
      const ids = cambios.filter(([, v]) => v === valor).map(([id]) => id);
      if (ids.length) await datos.actualizarEstado(ids, valor);
    }
    estado.borrador = {};
    guardarBorradorLocal();
    ui.toast(`✅ ${cambios.length} ${cambios.length === 1 ? 'cambio guardado' : 'cambios guardados'}`);
    return true;
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    return false;
  } finally {
    estado.guardando = false;
    render();
  }
}

function leerPestana() {
  try { return localStorage.getItem('rh-pestana') || 'todo'; } catch { return 'todo'; }
}

// ── Acciones ─────────────────────────────────────────────────

/**
 * Aplica las acciones (vengan del clasificador o, en la Fase 3, de Gemini).
 * Orden: vaciar → quitar → agregar.
 * Devuelve false si el usuario canceló el vaciado.
 */
async function aplicarAcciones(acciones) {
  if (acciones.some((a) => a.tipo === 'vaciar')) {
    const ok = await ui.confirmar({
      titulo: '¿Vaciar la lista?',
      mensaje: 'Se borrarán todos los faltantes para todos los usuarios.',
      textoAceptar: 'Sí, vaciar',
    });
    if (!ok) return false;
    await datos.vaciar();
  }

  const ids = acciones.filter((a) => a.tipo === 'quitar' && a.id).map((a) => a.id);
  if (ids.length) await datos.quitar(ids);

  const nuevos = acciones
    .filter((a) => a.tipo === 'agregar')
    .map((a) => ({
      ...normalizarClasificacion(a.categoria, a.subtipo),
      modelo: String(a.modelo ?? '').slice(0, 120),
      detalle: String(a.detalle ?? '').slice(0, 200),
      quedan: String(a.quedan ?? '').slice(0, 120),
    }));
  if (nuevos.length) await datos.agregar(nuevos);
  return true;
}

/**
 * Interpreta un mensaje: primero con la IA (Gemini) y, si falla,
 * con el clasificador de respaldo (solo posible si hay texto).
 */
async function interpretar(entrada) {
  if (estado.modo === 'supabase') {
    try {
      const inicio = performance.now();
      const r = await procesarConIA(entrada);
      log(`IA: ${Math.round(performance.now() - inicio)} ms en total`, r.tiempos ?? '');
      return { ...r, conIA: true };
    } catch (error) {
      console.warn('La IA falló; uso el respaldo:', error);
      if (!entrada.texto) throw new Error('sin-respaldo');
    }
  }
  return { ...clasificar(entrada.texto, estado.items), conIA: false };
}

/** Procesa texto, audio o foto y aplica las acciones. */
async function procesarMensaje(entrada) {
  const { acciones, respuesta, transcripcion, conIA } = await interpretar(entrada);
  const aplicado = await aplicarAcciones(acciones);
  if (!aplicado) return { aplicado, mensaje: 'No se vació la lista.' };

  let mensaje = respuesta;
  if (transcripcion && entrada.audio) mensaje = `🎙️ «${transcripcion}» → ${respuesta}`;
  if (!conIA && estado.modo === 'supabase') mensaje += ' (sin IA)';
  return { aplicado, mensaje };
}

/** Envoltura común: bloquea la barra mientras se procesa y muestra el resultado. */
async function ejecutar(entrada, { limpiarTexto = false } = {}) {
  if (estado.enviando) return;
  ponerEnviando(true);
  // Aviso inmediato para que se note que está trabajando
  if (estado.modo === 'supabase') ui.toast(entrada.audio ? '🎙️ Escuchando el audio…' : entrada.imagen ? '📷 Mirando la foto…' : '⏳ Procesando…', 30_000);
  try {
    const { aplicado, mensaje } = await procesarMensaje(entrada);
    if (aplicado && limpiarTexto) {
      elementos.texto.value = '';
      ajustarAltura();
    }
    ui.toast(mensaje, 4500);
  } catch (error) {
    console.error(error);
    ui.toast(error.message === 'sin-respaldo'
      ? 'La IA no respondió. Intenta de nuevo o escríbelo.'
      : 'Algo salió mal. Intenta de nuevo.');
  } finally {
    ponerEnviando(false);
  }
}

async function enviar(evento) {
  evento?.preventDefault();
  if (estado.grabacion) {
    await terminarGrabacion();
    return;
  }
  const texto = elementos.texto.value.trim();
  if (!texto) return;
  await ejecutar({ texto }, { limpiarTexto: true });
}

async function marcarLlego(item, nodo) {
  const ok = await ui.confirmar({
    titulo: `¿Llegó ${item.modelo || 'este producto'}?`,
    mensaje: 'Se quitará de la lista de faltantes para todos.',
    textoAceptar: 'Sí, llegó',
    peligro: false,
  });
  if (!ok) return;
  nodo.classList.add('saliendo');
  // Esperamos la animación antes de quitarlo
  await new Promise((r) => setTimeout(r, 220));
  try {
    await datos.quitar([item.id]);
    ui.toast(`✓ ${item.modelo || 'Producto'} quitado de la lista`);
  } catch (error) {
    console.error(error);
    nodo.classList.remove('saliendo'); // la tarjeta vuelve a aparecer
    ui.toast('No se pudo quitar. Revisa tu conexión.');
  }
}

async function reiniciarLista() {
  if (!estado.items.length) {
    ui.toast('La lista ya está vacía.');
    return;
  }
  try {
    const aplicado = await aplicarAcciones([{ tipo: 'vaciar' }]);
    if (aplicado) ui.toast('Lista reiniciada.');
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo reiniciar. Revisa tu conexión.');
  }
}

// ── Barra inferior ───────────────────────────────────────────

function ponerEnviando(si) {
  estado.enviando = si;
  elementos.enviar.disabled = si;
  elementos.enviar.classList.toggle('cargando', si);
}

/** El campo de texto crece con el contenido (hasta un máximo en CSS). */
function ajustarAltura() {
  const t = elementos.texto;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

elementos.texto.addEventListener('input', ajustarAltura);
elementos.texto.addEventListener('keydown', (e) => {
  // Enter envía; Shift+Enter hace salto de línea
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviar();
  }
});
elementos.barra.addEventListener('submit', enviar);
elementos.reiniciar.addEventListener('click', reiniciarLista);
elementos.terminar.addEventListener('click', terminarCompras);
elementos.guardarCompras.addEventListener('click', guardarCambiosCompras);

// ── Audio ────────────────────────────────────────────────────

function necesitaIA(que) {
  if (estado.modo === 'supabase') return false;
  ui.toast(`${que} necesita la IA: inicia sesión (en modo demo solo funciona el texto).`);
  return true;
}

function ponerGrabando(si) {
  document.body.classList.toggle('grabando', si);
  elementos.audio.setAttribute('aria-label', si ? 'Detener y enviar audio' : 'Grabar audio');
  elementos.cancelarAudio.hidden = !si;
  elementos.texto.disabled = si;
  elementos.texto.placeholder = si ? '🔴 Grabando… 0:00' : '¿Qué falta?';
}

async function alternarGrabacion() {
  if (estado.grabacion) {
    await terminarGrabacion();
    return;
  }
  if (estado.enviando || necesitaIA('El audio')) return;
  if (!media.puedeGrabar()) {
    ui.toast('Este navegador no permite grabar audio.');
    return;
  }
  try {
    estado.grabacion = await media.empezarGrabacion({
      onTick: (seg) => {
        elementos.texto.placeholder = `🔴 Grabando… ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
      },
      onLimite: () => terminarGrabacion(),
    });
    ponerGrabando(true);
  } catch (error) {
    console.error(error);
    ui.toast(error.name === 'NotAllowedError'
      ? 'Permite el micrófono para grabar (Ajustes → Safari → Micrófono).'
      : 'No se pudo usar el micrófono.');
  }
}

async function terminarGrabacion() {
  const grabacion = estado.grabacion;
  if (!grabacion) return;
  estado.grabacion = null;
  ponerGrabando(false);
  try {
    const audio = await grabacion.detener();
    const texto = elementos.texto.value.trim();
    await ejecutar({ audio: { base64: audio.base64, mime: audio.mime }, ...(texto && { texto }) },
      { limpiarTexto: true });
  } catch (error) {
    console.error(error);
    ui.toast('El audio salió vacío. Intenta de nuevo.');
  }
}

function cancelarGrabacion() {
  estado.grabacion?.cancelar();
  estado.grabacion = null;
  ponerGrabando(false);
  ui.toast('Audio cancelado.');
}

elementos.audio.addEventListener('click', alternarGrabacion);
elementos.cancelarAudio.addEventListener('click', cancelarGrabacion);

// ── Foto ─────────────────────────────────────────────────────

elementos.fotoBoton.addEventListener('click', (e) => {
  if (estado.enviando || estado.grabacion || necesitaIA('La foto')) e.preventDefault();
});

elementos.foto.addEventListener('change', async () => {
  const archivo = elementos.foto.files?.[0];
  elementos.foto.value = '';
  if (!archivo) return;
  try {
    ui.toast('📷 Analizando la foto…', 8000);
    const imagen = await media.prepararFoto(archivo);
    const texto = elementos.texto.value.trim(); // el texto escrito sirve de contexto
    await ejecutar({ imagen, ...(texto && { texto }) }, { limpiarTexto: true });
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo leer la foto.');
  }
});

// ── Vistas y sesión ──────────────────────────────────────────

/** Si un paso tarda demasiado, falla con un mensaje claro (nada de esperas mudas). */
function conTiempo(promesa, paso, ms = 15_000) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(`"${paso}" tardó demasiado`)), ms)),
  ]);
}

/** Cambia la vista visible: 'cargando' | 'login' | 'app' */
function mostrarVista(vista) {
  log('vista →', vista);
  document.body.dataset.vista = vista;
  if (vista === 'login') elementos.email.focus();
}

async function entrar(evento) {
  evento.preventDefault();
  const email = elementos.email.value;
  const password = elementos.password.value;
  if (!email || !password) {
    elementos.errorLogin.textContent = 'Escribe tu correo y tu contraseña.';
    return;
  }
  elementos.errorLogin.textContent = '';
  elementos.btnLogin.disabled = true;
  elementos.btnLogin.textContent = 'Entrando…';
  try {
    const usuario = await auth.iniciarSesion(email, password);
    log('login ok:', usuario?.email);
    elementos.password.value = '';
    // Seguimos de una vez (sin esperar el aviso de Supabase)
    if (usuario) alCambiarUsuario(usuario);
  } catch (error) {
    log('login falló:', error);
    elementos.errorLogin.textContent = error.message;
  } finally {
    elementos.btnLogin.disabled = false;
    elementos.btnLogin.textContent = 'Entrar';
  }
}

async function salir() {
  estado.usuarioId = null;
  await datos.detener();
  await auth.cerrarSesion();
  mostrarVista('login');
}

/** Se ejecuta cada vez que alguien entra o sale. */
async function alCambiarUsuario(usuario, evento = 'directo') {
  log('usuario:', evento, usuario?.email ?? '(ninguno)');
  if (!usuario) {
    estado.usuarioId = null;
    await datos.detener();
    estado.items = [];
    mostrarVista('login');
    return;
  }

  // El mismo usuario ya está entrando o adentro: aviso repetido, se ignora
  const vista = document.body.dataset.vista;
  if (usuario.id === estado.usuarioId && (vista === 'app' || vista === 'cargando')) return;
  estado.usuarioId = usuario.id;

  mostrarVista('cargando');
  try {
    const nombre = await conTiempo(auth.obtenerPerfil(), 'verificar permiso');
    log('perfil:', nombre);
    if (!nombre) {
      // Tiene cuenta pero NO está en usuarios_permitidos
      estado.usuarioId = null;
      await auth.cerrarSesion();
      elementos.errorLogin.textContent = 'Esta cuenta no tiene acceso a la lista.';
      mostrarVista('login');
      return;
    }
    elementos.usuario.textContent = `Hola, ${nombre}`;
    elementos.salir.hidden = false;
    await conTiempo(datos.usar('supabase'), 'cargar la lista');
    log('datos listos');
    estado.modo = 'supabase';
    estado.items = await datos.listar();
    log('faltantes:', estado.items.length);
    render();
    mostrarVista('app');
  } catch (error) {
    console.error('al entrar:', error);
    estado.usuarioId = null;
    elementos.errorLogin.textContent = `No se pudo entrar (${error.message || 'error'}). Revisa tu conexión e intenta de nuevo.`;
    mostrarVista('login');
  }
}

async function iniciarModoDemo() {
  elementos.usuario.textContent = 'Modo demo · datos de prueba';
  await datos.usar('demo');
  estado.modo = 'demo';
  estado.items = await datos.listar();
  render();
  mostrarVista('app');
}

// ── Arranque ─────────────────────────────────────────────────

async function iniciar() {
  ui.crearPestanas(elementos.pestanas, cambiarPestana);
  datos.suscribir((items) => { estado.items = items; render(); });
  // Refresca los "hace X min" cada minuto
  setInterval(render, 60_000);

  // Sin config.js (o abriendo la app con ?demo) → modo demo
  const config = await cargarConfig();
  const pideDemo = new URLSearchParams(location.search).has('demo');
  if (!config || pideDemo) {
    await iniciarModoDemo();
    return;
  }

  configurarIA(config.FUNCION_IA);
  try {
    await crearCliente(config);
  } catch (error) {
    console.error(error);
    elementos.errorLogin.textContent = 'No se pudo conectar. Revisa tu internet y recarga.';
    mostrarVista('login');
    return;
  }
  elementos.formLogin.addEventListener('submit', entrar);
  elementos.salir.addEventListener('click', salir);
  auth.alCambiarUsuario(alCambiarUsuario);
}

iniciar();

// ── PWA: botón "Instalar app" ────────────────────────────────
// Android/Chrome avisa con "beforeinstallprompt" que se puede instalar;
// lo guardamos para abrir el instalador cuando toquen el botón.
// iPhone no tiene ese evento: mostramos los pasos de Safari.
let eventoInstalar = null;
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const yaInstalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function leerAvisoCerrado() {
  try { return localStorage.getItem('rh-aviso-instalar') === 'cerrado'; } catch { return false; }
}

function debeMostrarInstalar() {
  return !yaInstalada() && !leerAvisoCerrado() && (Boolean(eventoInstalar) || esIOS);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  render();
});
window.addEventListener('appinstalled', () => {
  eventoInstalar = null;
  render();
  ui.toast('✅ App instalada. Ábrela desde tu pantalla de inicio.', 4500);
});

async function instalarApp() {
  if (eventoInstalar) {
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    render();
    return;
  }
  await ui.confirmar({
    titulo: 'Instalar en iPhone',
    mensaje: '1. Abre esta página en Safari.\n2. Toca Compartir (el cuadro con la flecha ↑).\n3. Toca "Agregar a pantalla de inicio" y luego "Agregar".\n\nDespués abre la app desde el icono RH Faltantes e inicia sesión una vez.',
    textoAceptar: 'Entendido',
    peligro: false,
    soloAceptar: true,
  });
}

function cerrarAvisoInstalar() {
  try { localStorage.setItem('rh-aviso-instalar', 'cerrado'); } catch { /* sin almacenamiento */ }
  render();
}

// ── PWA: registrar el service worker ─────────────────────────
// Solo funciona en HTTPS (GitHub Pages) o en localhost.
if ('serviceWorker' in navigator) {
  // Cuando se publica una versión nueva, el service worker nuevo toma el
  // control: recargamos UNA vez para usar el código nuevo enseguida.
  const habiaVersion = Boolean(navigator.serviceWorker.controller);
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargado) return;
    recargado = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker:', error));
  });
}
