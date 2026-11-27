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
  salirCompras: $('btn-salir-compras'),
  terminarCompra: $('btn-terminar-compra'),
  resumenCompras: $('compras-resumen'),
  facturas: $('btn-facturas'),
  volver: $('btn-volver'),
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
  verFacturas: false,
  facturas: [],
  facturaAbierta: null,
  facturaNueva: null,
  panelRegistro: 'facturas', // 'facturas' | 'actividad'
  actividad: [],
};

// ── Render ───────────────────────────────────────────────────

function render() {
  const pantalla = estado.verFacturas ? 'facturas' : estado.comprasDesde ? 'compras' : 'lista';
  document.body.dataset.modo = pantalla;
  if (pantalla === 'facturas') {
    ui.dibujarRegistro(elementos.lista, {
      panel: estado.panelRegistro,
      facturas: estado.facturas,
      actividad: estado.actividad,
      abierta: estado.facturaAbierta,
      nueva: estado.facturaNueva,
      onPDF: descargarPDF,
      onBorrar: borrarFactura,
      onPanel: (panel) => { estado.panelRegistro = panel; render(); animarEntrada(); },
    });
    // la animación de "guardada" solo una vez (cuando ya llegaron las facturas)
    if (estado.facturas !== null) estado.facturaNueva = null;
    return;
  }
  if (pantalla === 'compras') {
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
  const revisados = r.comprado + r.no_conseguido;
  elementos.progreso.textContent = total
    ? `${r.comprado} comprados · ${r.no_conseguido} no había · ${r.pendiente} por revisar`
    : 'Nada por comprar';
  elementos.barraProgreso.style.width = `${total ? Math.round((revisados / total) * 100) : 0}%`;
  elementos.resumenCompras.textContent = `${revisados} de ${total} revisados`;
  elementos.terminarCompra.disabled = estado.guardando;
  elementos.terminarCompra.textContent = estado.guardando ? 'Guardando…' : 'Terminar compra';
  ui.dibujarCompras(elementos.lista, estado.items, estado.comprasDesde, {
    borrador: estado.borrador,
    onMarcar: marcarEnBorrador,
    onDeshacer: deshacerMarca,
  });
}

/** Entrada en cascada de las tarjetas al cambiar de pestaña o de pantalla. */
function animarEntrada() {
  const l = elementos.lista;
  l.classList.remove('entrando');
  void l.offsetWidth;
  l.classList.add('entrando');
  clearTimeout(animarEntrada.t);
  animarEntrada.t = setTimeout(() => l.classList.remove('entrando'), 700);
}

function cambiarPestana(id) {
  estado.pestana = id;
  try { localStorage.setItem('rh-pestana', id); } catch { /* sin almacenamiento */ }
  render();
  animarEntrada();
  window.scrollTo({ top: 0 });
}

// ── Modo compras ─────────────────────────────────────────────
// Al marcar "Comprado" o "No hay", el producto sale de la vista y sube el
// siguiente. Las marcas quedan en un BORRADOR en el celular (sobrevive si se
// cierra la app) y se guardan al tocar "Terminar compra", que además crea
// la FACTURA permanente.

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
  animarEntrada();
  window.scrollTo({ top: 0 });
}

/** Salir sin terminar: las marcas quedan guardadas en el celular para seguir después. */
function salirDeCompras() {
  const hayMarcas = Object.keys(estado.borrador).length > 0;
  estado.comprasDesde = null;
  guardarCompras(null);
  render();
  window.scrollTo({ top: 0 });
  if (hayMarcas) ui.toast('Tus marcas quedan guardadas en este celular. Entra de nuevo para terminar la compra.', 5000);
}

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
    if (!item || valor === ui.estadoGuardado(item, estado.comprasDesde ?? Date.now())) {
      delete estado.borrador[id];
      cambio = true;
    }
  }
  if (cambio) guardarBorradorLocal();
}

/** Marca un producto (comprado / no_conseguido): sale de la vista y sube el siguiente. */
async function marcarEnBorrador(item, marca, nodo) {
  if (nodo) {
    nodo.classList.add(marca === 'comprado' ? 'saliendo-comprado' : 'saliendo-no-hay');
    await new Promise((r) => setTimeout(r, 180));
  }
  estado.borrador[item.id] = marca;
  guardarBorradorLocal();
  render();
}

/** "Deshacer" en "Ya revisados": el producto vuelve a "por revisar". */
function deshacerMarca(item) {
  if (ui.estadoGuardado(item, estado.comprasDesde) === 'pendiente') delete estado.borrador[item.id];
  else estado.borrador[item.id] = 'pendiente';
  guardarBorradorLocal();
  render();
}

async function terminarCompra() {
  if (estado.guardando) return;
  const efectivo = (it) => estado.borrador[it.id] ?? ui.estadoGuardado(it, estado.comprasDesde);
  const comprados = estado.items.filter((it) => efectivo(it) === 'comprado').map((it) => it.id);
  const noConseguidos = estado.items.filter((it) => efectivo(it) === 'no_conseguido').map((it) => it.id);
  const sinRevisar = estado.items.length - comprados.length - noConseguidos.length;

  if (!comprados.length && !noConseguidos.length) {
    const salir = await ui.confirmar({
      titulo: 'No marcaste ningún producto',
      mensaje: '¿Salir del Modo compras sin crear factura?',
      textoAceptar: 'Salir',
      peligro: false,
    });
    if (salir) salirDeCompras();
    return;
  }

  const ok = await ui.confirmar({
    titulo: '¿Terminar la compra?',
    mensaje: [
      `✓ Comprados: ${comprados.length} (salen de la lista)`,
      `✗ No se consiguieron: ${noConseguidos.length} (siguen en la lista)`,
      sinRevisar ? `• Sin revisar: ${sinRevisar} (siguen en la lista)` : '',
      '',
      'Se guardará la factura de esta compra.',
    ].filter((linea, i, todas) => linea || todas[i + 1]).join('\n'),
    textoAceptar: 'Terminar y guardar',
    peligro: false,
  });
  if (!ok) return;

  estado.guardando = true;
  render();
  try {
    const factura = await datos.cerrarCompra(comprados, noConseguidos);
    estado.borrador = {};
    guardarBorradorLocal();
    estado.comprasDesde = null;
    guardarCompras(null);
    estado.guardando = false;
    estado.facturaNueva = factura?.id ?? null;
    await abrirFacturas(factura?.id);
    ui.toast('🧾 Factura guardada', 3500);
  } catch (error) {
    console.error(error);
    estado.guardando = false;
    render();
    ui.toast('No se pudo guardar la compra. Revisa tu conexión e intenta de nuevo.', 6000);
  }
}

// ── Facturas ─────────────────────────────────────────────────

async function cargarRegistro() {
  const [facturas, actividad] = await Promise.allSettled([datos.listarCompras(), datos.listarActividad()]);
  estado.facturas = facturas.status === 'fulfilled' ? facturas.value : [];
  estado.actividad = actividad.status === 'fulfilled' ? actividad.value : [];
  if (facturas.status === 'rejected' || actividad.status === 'rejected') {
    console.error(facturas.reason ?? actividad.reason);
    ui.toast('No se pudo cargar todo. Revisa tu conexión.');
  }
}

async function abrirFacturas(idAbierta = null) {
  estado.verFacturas = true;
  estado.panelRegistro = 'facturas';
  estado.facturas = null; // "cargando"
  estado.actividad = null;
  render();
  window.scrollTo({ top: 0 });
  await cargarRegistro();
  estado.facturaAbierta = idAbierta ?? estado.facturas[0]?.id ?? null;
  render();
  animarEntrada();
}

async function descargarPDF(factura) {
  try {
    const { descargarFacturaPDF } = await import('./pdf.js');
    await descargarFacturaPDF(factura);
    ui.toast('📄 PDF descargado');
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo crear el PDF. Revisa tu conexión e intenta de nuevo.');
  }
}

async function borrarFactura(f) {
  const ok = await ui.confirmar({
    titulo: '¿Borrar esta factura?',
    mensaje: `Factura del ${new Date(f.creada_en).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })} (${f.hecha_por}).\n\nSe borra para todos y no se puede recuperar. Si la necesitas, descarga antes el PDF. En el historial quedará anotado quién la borró.`,
    textoAceptar: 'Sí, borrar',
  });
  if (!ok) return;
  try {
    await datos.borrarCompra(f.id);
    await cargarRegistro();
    render();
    ui.toast('🗑️ Factura borrada');
  } catch (error) {
    console.error(error);
    ui.toast('No se pudo borrar la factura. Revisa tu conexión.');
  }
}

function cerrarFacturas() {
  estado.verFacturas = false;
  render();
  animarEntrada();
  window.scrollTo({ top: 0 });
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
      estado.ultimoErrorIA = '';
      log(`IA: ${Math.round(performance.now() - inicio)} ms en total`, r.tiempos ?? '');
      return { ...r, conIA: true };
    } catch (error) {
      console.warn('La IA falló; uso el respaldo:', error);
      estado.ultimoErrorIA = error.message;
      if (!entrada.texto) throw Object.assign(new Error('sin-respaldo'), { razon: error.message });
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
  if (!conIA && estado.modo === 'supabase') {
    mensaje += ` (sin IA${estado.ultimoErrorIA ? ` — ${estado.ultimoErrorIA}` : ''})`;
  }
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
      ? `La IA no respondió${error.razon ? ` — ${error.razon}` : ''}. Intenta de nuevo o escríbelo.`
      : 'Algo salió mal. Intenta de nuevo.', 8000);
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
elementos.salirCompras.addEventListener('click', salirDeCompras);
elementos.terminarCompra.addEventListener('click', terminarCompra);
elementos.facturas.addEventListener('click', () => abrirFacturas());
elementos.volver.addEventListener('click', cerrarFacturas);

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

// ── Alto del encabezado ──────────────────────────────────────
// Las pestañas van pegadas JUSTO debajo del encabezado; como su alto cambia
// (notch del iPhone, nombre largo), lo medimos en vez de adivinarlo.
const medirEncabezado = () => {
  const h = document.querySelector('.encabezado-lista')?.getBoundingClientRect().height;
  if (h) document.documentElement.style.setProperty('--alto-encabezado', `${Math.round(h)}px`);
};
if ('ResizeObserver' in window) new ResizeObserver(medirEncabezado).observe(document.querySelector('.encabezado-lista'));
window.addEventListener('resize', medirEncabezado);

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
  if (vista === 'app') animarEntrada();
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
  elementos.usuario.textContent = 'Modo demo';
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
