// ─────────────────────────────────────────────────────────────
// GARANTÍAS · pantallas y acciones
// Pestañas: En trámite → Con respuesta → Entregadas.
// Ficha: cliente (cédula), equipo, compra, falla, fotos, historial y
// el conteo de los 30 días hábiles de respuesta.
// Flujo: Recibir → Enviar al proveedor → Registrar respuesta → Entregar.
// Arriba hay dos partes: 👥 Clientes (este archivo) y 🏪 Productos del local
// (productos que salen malos al probarlos y se devuelven: js/garantias/productos.js).
// SEGURIDAD: todo texto se pinta con textContent (vía el()).
// ─────────────────────────────────────────────────────────────
import { el, toast, confirmar } from '../ui.js';
import * as datos from './datos.js';
import { abrirHoja } from '../servicio/hoja.js';
import { seccion, campoTexto, botonesHoja, selectorUnico, selectorVarios } from '../servicio/formulario.js';
import { abrirWhatsApp, pesos } from '../servicio/whatsapp.js';
import { prepararFoto } from '../media.js';
import { DIAS_GARANTIA, sumarHabiles, habilesEntre, aISO, deISO } from './habiles.js';
import { TIPOS, nombreEquipo, mensajeRecibida, mensajeRespuesta, mensajeEntregada } from './mensajes.js';
import * as P from './productos.js';

const ICONO = { celular: '📱', sonido: '🔊', otro: '📦' };
// Lo que suele traer cada tipo de equipo (más "Otro" para escribir)
const LLEGO_CON = {
  celular: ['SIM', 'Memoria', 'Forro', 'Cargador', 'Cable', 'Caja'],
  sonido: ['Cargador', 'Cable', 'Control', 'Micrófono', 'Caja'],
  otro: ['Cargador', 'Cable', 'Caja', 'Manual'],
};
const ESTADO_RECIBIDO = {
  celular: ['Pantalla rota', 'Rayones', 'Golpes', 'Mojado', 'No enciende'],
  sonido: ['Rayones', 'Golpes', 'Mojado', 'No enciende', 'Sin sonido'],
  otro: ['Rayones', 'Golpes', 'Mojado', 'No enciende'],
};
const RESULTADOS = {
  reparado: '🔧 Reparado', cambio: '🔄 Cambio de equipo', devolucion: '💵 Devolución del dinero', rechazada: '❌ Rechazada',
};
const MOMENTOS = { recibido: 'Cómo llegó', envio: 'Al enviar', respuesta: 'Al volver' };

const est = { modo: 'demo', contenedor: null, onInicio: null, onCambio: null, lista: [], tab: 'tramite', busqueda: '',
  vista: 'lista', id: null, detalle: null, visible: false, suscrito: false,
  parte: 'clientes', // 'clientes' | 'productos'
  devoluciones: [] };

const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const soloFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaMaxima = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ── Arranque ─────────────────────────────────────────────────

export async function iniciarGarantias({ modo, contenedor, onInicio, onCambio }) {
  Object.assign(est, { modo, contenedor, onInicio, onCambio });
  await datos.usar(modo);
  if (!est.suscrito) { datos.suscribir(() => recargar()); est.suscrito = true; }
  await recargar();
}

export function contar() {
  return {
    tramite: est.lista.filter((g) => g.estado === 'recibida' || g.estado === 'enviada').length,
    respuesta: est.lista.filter((g) => g.estado === 'respuesta').length,
    vencidas: est.lista.filter((g) => (g.estado === 'recibida' || g.estado === 'enviada') && deISO(g.limite) < hoy()).length,
    porDevolver: P.contarProductos(est.devoluciones).porDevolver,
  };
}

export async function mostrar() {
  est.visible = true;
  est.vista = 'lista';
  P.irALista();
  render();
  datos.limpiarFotosVencidas().catch((e) => console.warn('fotos garantías:', e));
  datos.limpiarFotosDevoluciones().catch((e) => console.warn('fotos devoluciones:', e));
  await recargar();
}
export function ocultar() { est.visible = false; }
export async function datosParaCopia() { return datos.listo() ? datos.copia() : {}; }

async function recargar() {
  try {
    [est.lista, est.devoluciones] = await Promise.all([datos.listar(), datos.listarDevoluciones()]);
    if (est.vista === 'ficha' && est.id) est.detalle = await datos.detalle(est.id);
    if (P.idActual()) P.ponerDetalle(await datos.detalleDevolucion(P.idActual()));
  } catch (error) {
    console.error('garantías:', error);
  }
  est.onCambio?.();
  if (est.visible && est.vista !== 'recibir') render();
}

// Lo que la parte de productos necesita de este archivo
const ctx = {
  render: () => render(),
  recargar: () => recargar(),
  contenedor: () => est.contenedor,
  devoluciones: () => est.devoluciones,
  encabezado: (...a) => encabezado(...a),
  botonFoto: (...a) => botonFoto(...a),
  aBlob: (a) => aBlob(a),
  trabajar: (...a) => trabajar(...a),
};

function selectorParte() {
  const c = contar();
  const boton = (id, texto, n) => el('button', {
    type: 'button', class: `gr-parte ${est.parte === id ? 'on' : ''}`, 'aria-pressed': String(est.parte === id),
    onclick: () => { est.parte = id; render(); window.scrollTo({ top: 0 }); },
  }, texto, n ? el('span', { class: 'contador', text: String(n) }) : null);
  return el('div', { class: 'gr-partes' },
    boton('clientes', '👥 Clientes', c.tramite + c.respuesta),
    boton('productos', '🏪 Productos del local', c.porDevolver));
}

function render() {
  if (!est.contenedor || est.vista === 'recibir') return;
  if (est.parte === 'productos') {
    if (P.vistaActual() === 'formulario') return; // el formulario se maneja solo
    if (P.vistaActual() === 'ficha' && P.idActual()) { est.contenedor.replaceChildren(...P.vistaFichaProductos(ctx)); return; }
    const c = P.contarProductos(est.devoluciones);
    est.contenedor.replaceChildren(
      encabezado('🛡️ Garantías', `${c.porDevolver} por devolver · ${c.devueltos} devueltos`, () => est.onInicio?.()),
      el('div', { class: 'st-cuerpo lista' }, selectorParte(), ...P.vistaListaProductos(ctx, est.devoluciones).filter(Boolean)),
      el('button', { type: 'button', class: 'st-fab', onclick: () => P.abrirFormulario(ctx) }, '＋ Producto para devolver'));
    return;
  }
  if (est.vista === 'ficha' && est.detalle) est.contenedor.replaceChildren(...vistaFicha(est.detalle));
  else est.contenedor.replaceChildren(...vistaLista());
}

function encabezado(titulo, sub, volver, acciones = []) {
  return el('header', { class: 'encabezado st-encabezado' },
    el('button', { type: 'button', class: 'btn btn-secundario st-volver', 'aria-label': 'Volver', onclick: volver }, '‹'),
    el('div', { class: 'st-titulo' }, el('h1', { class: 'marca-nombre', text: titulo }), sub ? el('p', { class: 'marca-sub', text: sub }) : null),
    el('div', { class: 'encabezado-acciones' }, ...acciones));
}

// ── Tiempo de respuesta (30 días hábiles) ────────────────────

const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

/** { usados, quedan, vencida, texto, clase } para una garantía abierta. */
function plazo(g) {
  const usados = Math.min(habilesEntre(new Date(g.creado_en)), 999);
  const limite = deISO(g.limite);
  const quedan = habilesEntre(hoy(), limite);
  const vencida = limite < hoy();
  const texto = vencida ? `⚠️ Pasó el plazo (${fechaLarga.format(limite)})`
    : `Día hábil ${usados} de ${DIAS_GARANTIA} · responde a más tardar el ${fechaLarga.format(limite)}`;
  return { usados, quedan, vencida, texto, clase: vencida ? 'st-vencido' : quedan <= 5 ? 'st-por-vencer' : '' };
}

function barraPlazo(g) {
  const p = plazo(g);
  const pct = Math.min(100, Math.round((p.usados / DIAS_GARANTIA) * 100));
  return el('div', { class: `gr-plazo ${p.clase}` },
    el('div', { class: 'gr-plazo-barra' }, el('span', { style: `width:${pct}%` })),
    el('small', { text: p.texto }));
}

// ── Lista con pestañas ───────────────────────────────────────

function vistaLista() {
  const tramite = est.lista.filter((g) => g.estado === 'recibida' || g.estado === 'enviada')
    .sort((a, b) => a.limite.localeCompare(b.limite)); // las que vencen primero, arriba
  const respuesta = est.lista.filter((g) => g.estado === 'respuesta').sort((a, b) => a.respuesta_en.localeCompare(b.respuesta_en));
  const entregadas = est.lista.filter((g) => g.estado === 'entregada').sort((a, b) => b.entregado_en.localeCompare(a.entregado_en));
  const q = est.busqueda.trim().toLowerCase();
  const coincide = (g) => !q || [g.cliente, g.cedula, g.telefono, g.equipo, g.serial, g.tipo_otro, String(g.numero)]
    .some((v) => String(v || '').toLowerCase().includes(q));
  const lista = { tramite, respuesta, entregadas }[est.tab].filter(coincide);

  const pestana = (id, texto, n) => el('button', {
    type: 'button', role: 'tab', class: 'segmento', 'aria-selected': String(est.tab === id),
    onclick: () => { est.tab = id; render(); },
  }, texto, el('span', { class: 'contador', text: String(n) }));

  const buscador = el('input', {
    type: 'search', class: 'st-buscar', placeholder: '🔍 Buscar nombre, cédula, teléfono, serial…', value: est.busqueda, 'aria-label': 'Buscar',
    oninput: (e) => {
      est.busqueda = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const nuevo = est.contenedor.querySelector('.st-buscar');
      nuevo.focus();
      nuevo.setSelectionRange(pos, pos);
    },
  });

  const vacio = {
    tramite: ['🛡️', 'No hay garantías en trámite', 'Toca "＋ Recibir garantía" cuando un cliente traiga un equipo.'],
    respuesta: ['📬', 'Nada esperando entrega', 'Aquí aparecen las garantías que ya tienen respuesta.'],
    entregadas: ['🗂️', 'Aún no hay entregadas', ''],
  }[est.tab];

  return [
    encabezado('🛡️ Garantías', `${tramite.length} en trámite · ${respuesta.length} con respuesta`, () => est.onInicio?.()),
    el('div', { class: 'st-cuerpo lista' },
      selectorParte(),
      buscador,
      el('div', { class: 'segmentos segmentos-3', role: 'tablist' },
        pestana('tramite', 'En trámite', tramite.length),
        pestana('respuesta', 'Con respuesta', respuesta.length),
        pestana('entregadas', 'Entregadas', entregadas.length)),
      lista.length
        ? el('ul', { class: 'tarjetas' }, ...lista.map(tarjeta))
        : el('div', { class: 'vacio-estado' },
          el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: q ? '🔍' : vacio[0] }),
          el('h2', { class: 'vacio-titulo', text: q ? 'Sin resultados' : vacio[1] }),
          !q && vacio[2] ? el('p', { class: 'vacio-texto', text: vacio[2] }) : null),
      est.tab === 'entregadas' && lista.length ? el('p', { class: 'st-candado', text: '🔒 Las garantías entregadas quedan guardadas para siempre.' }) : null),
    est.tab === 'tramite' ? el('button', { type: 'button', class: 'st-fab', onclick: abrirRecibir }, '＋ Recibir garantía') : null,
  ].filter(Boolean);
}

function etiquetaEstado(g) {
  if (g.estado === 'recibida') return el('span', { class: 'etiqueta gr-en-tienda', text: 'En la tienda' });
  if (g.estado === 'enviada') return el('span', { class: 'etiqueta gr-enviada', text: 'Enviada' });
  if (g.estado === 'respuesta') {
    return el('span', { class: `etiqueta ${g.resultado === 'rechazada' ? 'etiqueta-no-hay' : 'etiqueta-comprado'}`, text: RESULTADOS[g.resultado] });
  }
  return el('span', { class: 'etiqueta etiqueta-comprado', text: 'Entregada ✓' });
}

function tarjeta(g) {
  const abierta = g.estado === 'recibida' || g.estado === 'enviada';
  return el('li', { class: 'tarjeta st-tarjeta', onclick: () => abrirFicha(g.id) },
    el('div', { class: 'tarjeta-info' },
      el('div', { class: 'st-fila' },
        el('h4', { class: 'tarjeta-modelo', text: `${ICONO[g.tipo]} ${nombreEquipo(g)}` }),
        etiquetaEstado(g)),
      el('p', { class: 'tarjeta-detalle', text: [g.cliente, g.cedula && `C.C. ${g.cedula}`, g.telefono].filter(Boolean).join(' · ') }),
      g.falla ? el('p', { class: 'st-problema', text: `⚠️ ${g.falla}` }) : null,
      g.estado === 'enviada' ? el('p', { class: 'st-nota', text: `📦 ${g.enviado_a}${g.guia ? ` · ${g.guia}` : ''}` }) : null,
      abierta ? barraPlazo(g) : null,
      g.estado === 'respuesta' ? el('p', { class: 'st-nota', text: `Respuesta del ${soloFecha.format(new Date(g.respuesta_en))}${g.respuesta ? ` · ${g.respuesta}` : ''}` }) : null,
      g.estado === 'entregada' ? el('p', { class: 'st-nota', text: `Entregada el ${soloFecha.format(new Date(g.entregado_en))} · ${g.entregado_por ?? ''}` }) : null));
}

// ── Ficha ────────────────────────────────────────────────────

async function abrirFicha(id) {
  est.id = id;
  est.vista = 'ficha';
  try {
    est.detalle = await datos.detalle(id);
  } catch (error) {
    console.error(error);
    toast('No se pudo abrir la garantía.');
    est.vista = 'lista';
  }
  render();
  window.scrollTo({ top: 0 });
}

function volverALista() {
  est.vista = 'lista';
  est.id = null;
  est.detalle = null;
  render();
}

const datosLista = (pares) => el('dl', { class: 'st-datos' },
  ...pares.filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

function vistaFicha({ garantia: g, eventos, fotos }) {
  const entregada = g.estado === 'entregada';
  const abierta = g.estado === 'recibida' || g.estado === 'enviada';
  const estadoTexto = { recibida: '🏪 En la tienda', enviada: '📦 Enviada al proveedor', respuesta: '📬 Con respuesta', entregada: '🔒 Entregada' }[g.estado];
  const meses = g.fecha_compra ? Math.floor((Date.now() - deISO(g.fecha_compra).getTime()) / (30.44 * 86_400_000)) : null;

  return [
    encabezado(`${ICONO[g.tipo]} ${nombreEquipo(g)}`, `Garantía #${g.numero} · ${estadoTexto}`, volverALista),
    el('div', { class: 'st-cuerpo lista st-ficha' },
      abierta ? el('section', { class: 'tarjeta st-seccion gr-aviso-plazo' },
        el('h4', { class: 'st-seccion-titulo', text: '⏳ Tiempo de respuesta: hasta 30 días hábiles' }),
        el('p', { class: 'gr-fecha-max' }, el('small', { text: '📅 Fecha máxima de respuesta' }), el('b', { text: fechaMaxima.format(deISO(g.limite)) })),
        barraPlazo(g)) : null,
      seccion('👤 Cliente',
        datosLista([['Nombre', g.cliente], ['Cédula', g.cedula], ['Teléfono', g.telefono]]),
        g.telefono ? el('div', { class: 'st-botones' },
          el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => abrirWhatsApp(g.telefono, `Hola ${g.cliente.split(' ')[0]} 👋, le escribe *RH Tecnology*.`) }, '💬 WhatsApp')) : null),
      seccion(`${ICONO[g.tipo]} Equipo`,
        datosLista([
          ['Tipo', g.tipo === 'otro' ? `Otro: ${g.tipo_otro || '—'}` : TIPOS[g.tipo].slice(3)],
          ['Equipo', g.equipo], ['IMEI / serial', g.serial],
          ['Llegó con', [...g.llego_con, g.llego_con_otro && `Otro: ${g.llego_con_otro}`].filter(Boolean).join(', ')],
          ['Cómo llegó', [...g.estado_recibido, g.estado_recibido_otro && `Otro: ${g.estado_recibido_otro}`].filter(Boolean).join(', ')],
          ['Recibió', `${g.creado_por} · ${fechaCorta.format(new Date(g.creado_en))}`],
        ])),
      seccion('🧾 Compra',
        datosLista([
          ['Fecha', g.fecha_compra ? `${soloFecha.format(deISO(g.fecha_compra))}${meses != null ? ` (hace ${meses < 1 ? 'menos de 1 mes' : `${meses} ${meses === 1 ? 'mes' : 'meses'}`})` : ''}` : 'Sin dato'],
          ['Valor', g.valor_compra ? pesos(g.valor_compra) : 'Sin dato'], ['Factura', g.factura],
        ])),
      seccion('⚠️ La garantía',
        datosLista([['Qué le pasa', g.falla], ['Por qué se manda', g.motivo],
          ['Enviada a', g.enviado_a && `${g.enviado_a}${g.guia ? ` · ${g.guia}` : ''}${g.enviado_en ? ` · ${soloFecha.format(new Date(g.enviado_en))}` : ''}`],
          ['Respuesta', g.resultado && `${RESULTADOS[g.resultado]}${g.respuesta ? ` · ${g.respuesta}` : ''}`],
          ['Entregó', entregada && `${g.entregado_por} · ${fechaCorta.format(new Date(g.entregado_en))}`]])),
      seccionFotos(g, fotos, entregada),
      seccion('🧾 Historial', el('ol', { class: 'st-historial' }, ...eventos.map((e) => el('li', { class: 'st-evento',
        style: `--c:${{ enviada: 'var(--marca-celeste)', respuesta: 'var(--exito)', entregada: 'var(--exito)', nota: 'var(--aviso-texto)' }[e.tipo] ?? 'var(--marca-brillante)'}` },
        el('small', { text: `${fechaCorta.format(new Date(e.creado_en))} · ${e.autor}` }), el('span', { text: e.texto })))),
        el('div', { class: 'st-botones' },
          el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => agregarNota(g) }, '📝 Agregar nota'),
          !entregada ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => editarDatos(g) }, '✏️ Editar datos') : null)),
      ...acciones(g)),
  ];
}

function seccionFotos(g, fotos, entregada) {
  const vivas = fotos.filter((f) => !f.borrada_en);
  const borradas = fotos.length - vivas.length;
  return seccion(`📷 Fotos (${vivas.length})`,
    vivas.length ? el('div', { class: 'st-fotos' }, ...vivas.map((f) => el('figure', { class: 'st-foto' },
      f.url ? el('img', { src: f.url, alt: f.etiqueta || 'Foto', loading: 'lazy', onclick: () => window.open(f.url, '_blank', 'noopener') })
        : el('div', { class: 'st-foto-vacia', text: '📷' }),
      el('figcaption', { text: f.etiqueta || MOMENTOS[f.momento] })))) : null,
    borradas ? el('p', { class: 'st-nota', text: `🗑️ ${borradas} foto(s) se borraron solas (30 días después de entregada).` }) : null,
    !vivas.length && !borradas ? el('p', { class: 'st-nota', text: 'Sin fotos todavía.' }) : null,
    el('p', { class: 'st-nota', text: 'Las fotos se guardan mientras la garantía está abierta y se borran 30 días después de entregada.' }),
    !entregada ? el('div', { class: 'st-botones' }, botonFoto((archivo) => agregarFoto(g, archivo))) : null);
}

function botonFoto(alElegir, texto = '📷 Agregar foto') {
  return el('label', { class: 'btn btn-secundario' }, texto, el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async (e) => {
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (archivo) await alElegir(archivo);
    } }));
}

async function aBlob(archivo) {
  const foto = await prepararFoto(archivo, 1100);
  return (await fetch(`data:${foto.mime};base64,${foto.base64}`)).blob();
}

function acciones(g) {
  if (g.estado === 'recibida') {
    return [
      el('button', { type: 'button', class: 'grande btn-principal st-grande', onclick: () => enviarProveedor(g) }, '📦 Enviar al proveedor'),
      el('button', { type: 'button', class: 'btn btn-secundario st-ancho', onclick: () => registrarRespuesta(g) }, '✅ Ya hay respuesta (se resolvió en la tienda)'),
    ];
  }
  if (g.estado === 'enviada') {
    return [el('button', { type: 'button', class: 'grande btn-exito st-grande', onclick: () => registrarRespuesta(g) }, '📬 Registrar respuesta del proveedor')];
  }
  if (g.estado === 'respuesta') {
    return [
      el('button', { type: 'button', class: 'grande btn-exito st-grande', onclick: () => entregarCliente(g) }, '🤝 Entregar al cliente'),
      g.telefono ? el('button', { type: 'button', class: 'btn btn-secundario st-ancho', onclick: () => avisar(g, mensajeRespuesta(g), 'Se avisó al cliente la respuesta por WhatsApp.') }, '💬 Avisar al cliente por WhatsApp') : null,
    ];
  }
  return [el('p', { class: 'st-candado', text: '🔒 Entregada: queda guardada para siempre y no se puede borrar ni cambiar (solo agregar notas).' })];
}

// ── Acciones ─────────────────────────────────────────────────

async function trabajar(promesa, exito) {
  try {
    const r = await promesa;
    if (exito) toast(exito);
    await recargar();
    return r ?? true;
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo guardar. Revisa tu conexión.', 5000);
    return null;
  }
}

function avisar(g, mensaje, textoHistorial) {
  abrirWhatsApp(g.telefono, mensaje);
  datos.nota(g.id, 'whatsapp', textoHistorial).catch(() => {});
}

async function agregarNota(g) {
  const texto = await abrirHoja('📝 Agregar nota', (cerrar) => {
    const t = campoTexto('Nota (queda en el historial, no se puede borrar)', { multilinea: true, placeholder: 'Ej: Se llamó al proveedor, dicen que llega el lunes' });
    return [t.nodo, botonesHoja(cerrar, 'Guardar', () => cerrar(t.entrada.value.trim()))];
  });
  if (texto) await trabajar(datos.nota(g.id, 'nota', texto), '📝 Nota guardada');
}

async function agregarFoto(g, archivo) {
  let blob;
  try { blob = await aBlob(archivo); } catch { toast('No se pudo leer la foto.'); return; }
  const r = await abrirHoja('📷 Nueva foto', (cerrar) => {
    let momento = g.estado === 'recibida' ? 'recibido' : g.estado === 'enviada' ? 'envio' : 'respuesta';
    const etiqueta = campoTexto('¿Qué muestra?', { placeholder: 'Ej: Puerto de carga dañado' });
    return [
      el('img', { class: 'st-vista-previa', src: URL.createObjectURL(blob), alt: '' }),
      etiqueta.nodo,
      selectorUnico(Object.entries(MOMENTOS), momento, (v) => { momento = v; }),
      botonesHoja(cerrar, 'Guardar foto', () => cerrar({ etiqueta: etiqueta.entrada.value.trim(), momento })),
    ];
  });
  if (r) await trabajar(datos.subirFoto(g.id, blob, r.etiqueta, r.momento), '📷 Foto guardada');
}

async function enviarProveedor(g) {
  const r = await abrirHoja('📦 Enviar al proveedor', (cerrar) => {
    const destino = campoTexto('¿A quién se envía? *', { placeholder: 'Ej: Distribuidor Samsung Sincelejo' });
    const guia = campoTexto('Guía o recibo (opcional)', { placeholder: 'Ej: Servientrega 123456' });
    const nota = campoTexto('Nota (opcional)', { placeholder: 'Ej: Va en su caja original con el cargador' });
    return [destino.nodo, guia.nodo, nota.nodo,
      botonesHoja(cerrar, 'Marcar como enviada', () => {
        if (destino.entrada.value.trim().length < 2) { toast('Escribe a quién se envía'); return; }
        cerrar({ destino: destino.entrada.value.trim(), guia: guia.entrada.value.trim(), nota: nota.entrada.value.trim() });
      })];
  });
  if (r) await trabajar(datos.enviar(g.id, r.destino, r.guia, r.nota), '📦 Marcada como enviada');
}

async function registrarRespuesta(g) {
  const r = await abrirHoja('📬 Respuesta de la garantía', (cerrar) => {
    let resultado = '';
    const detalle = campoTexto('Detalle (opcional)', { multilinea: true, placeholder: 'Ej: Le cambiaron el puerto de carga / llega equipo nuevo' });
    const avisarCaja = el('input', { type: 'checkbox', checked: Boolean(g.telefono) });
    return [
      el('span', { class: 'st-etiqueta', text: '¿Qué respondieron?' }),
      selectorUnico(Object.entries(RESULTADOS), resultado, (v) => { resultado = v; }),
      detalle.nodo,
      g.telefono ? el('label', { class: 'st-check' }, avisarCaja, 'Avisar al cliente por WhatsApp') : null,
      botonesHoja(cerrar, 'Guardar respuesta', () => {
        if (!resultado) { toast('Elige qué respondieron'); return; }
        cerrar({ resultado, detalle: detalle.entrada.value.trim(), avisar: avisarCaja.checked });
      }, 'btn-exito'),
    ];
  });
  if (!r) return;
  const n = await trabajar(datos.responder(g.id, r.resultado, r.detalle), '📬 Respuesta guardada: pasa a "Con respuesta"');
  if (n && r.avisar && g.telefono) avisar(g, mensajeRespuesta({ ...g, ...n }), 'Se avisó al cliente la respuesta por WhatsApp.');
}

async function entregarCliente(g) {
  const r = await abrirHoja('🤝 Entregar al cliente', (cerrar) => {
    const nota = campoTexto('Nota (opcional)', { placeholder: 'Ej: Se entregó equipo nuevo, serial 3567…' });
    const gracias = el('input', { type: 'checkbox', checked: Boolean(g.telefono) });
    return [
      el('p', { class: 'st-nota', text: `${RESULTADOS[g.resultado]}${g.respuesta ? ` · ${g.respuesta}` : ''}` }),
      el('p', { class: 'st-nota st-aviso', text: '🪪 Pide la cédula del cliente antes de entregar.' }),
      nota.nodo,
      g.telefono ? el('label', { class: 'st-check' }, gracias, 'Enviar agradecimiento por WhatsApp') : null,
      botonesHoja(cerrar, '✓ Entregar', () => cerrar({ nota: nota.entrada.value.trim(), gracias: gracias.checked }), 'btn-exito'),
    ];
  });
  if (!r) return;
  const n = await trabajar(datos.entregar(g.id, r.nota), '🤝 Entregada: pasó a Entregadas');
  if (!n) return;
  est.tab = 'entregadas';
  volverALista();
  if (r.gracias && g.telefono) avisar(g, mensajeEntregada(g), 'Se envió el agradecimiento por WhatsApp.');
}

async function editarDatos(g) {
  const r = await abrirHoja('✏️ Editar datos', (cerrar) => {
    let tipo = g.tipo;
    const c = {
      cliente: campoTexto('Cliente', { value: g.cliente }), cedula: campoTexto('Cédula', { value: g.cedula, inputmode: 'numeric' }),
      telefono: campoTexto('Teléfono', { value: g.telefono, inputmode: 'tel' }), tipo_otro: campoTexto('¿Qué es? (si es "Otro")', { value: g.tipo_otro }),
      equipo: campoTexto('Equipo (marca y modelo)', { value: g.equipo }), serial: campoTexto('IMEI / serial', { value: g.serial }),
      fecha_compra: campoTexto('Fecha de compra', { type: 'date', value: g.fecha_compra ?? '', max: aISO(new Date()) }),
      valor_compra: campoTexto('Valor del aparato', { dinero: true, value: g.valor_compra || '', min: 0 }),
      factura: campoTexto('N.º de factura', { value: g.factura }),
      falla: campoTexto('¿Qué le pasa?', { multilinea: true, value: g.falla }), motivo: campoTexto('¿Por qué se manda a garantía?', { multilinea: true, value: g.motivo }),
    };
    return [selectorUnico(Object.entries(TIPOS), tipo, (v) => { tipo = v; }), ...Object.values(c).map((x) => x.nodo),
      botonesHoja(cerrar, 'Guardar', () => {
        const d = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x.entrada.value.trim()]));
        d.valor_compra = Number(d.valor_compra) || 0;
        cerrar({ ...d, tipo });
      })];
  });
  if (r) await trabajar(datos.actualizar(g.id, r), '✏️ Datos actualizados');
}

// ── Recibir equipo en garantía ───────────────────────────────

function abrirRecibir() {
  est.vista = 'recibir';
  const limite = sumarHabiles(new Date());
  const f = {
    tipo: 'celular', tipo_otro: '', cliente: '', cedula: '', telefono: '', equipo: '', serial: '', fecha_compra: '', valor_compra: '',
    factura: '', falla: '', motivo: '', llego_con: [], llego_con_otro: '', estado_recibido: [], estado_recibido_otro: '',
  };
  const fotos = [];
  const entradas = {};
  const campo = (clave, etiqueta, props = {}) => {
    const c = campoTexto(etiqueta, { value: f[clave], ...props, oninput: (e) => { f[clave] = e.target.value; } });
    entradas[clave] = c.entrada;
    return c.nodo;
  };

  // Lo que depende del tipo de equipo (opciones de "Llegó con", "Cómo llegó" y el campo "¿Qué es?")
  const zonaTipo = el('div', { class: 'st-form-grupo' });
  const pintarTipo = () => {
    f.llego_con = f.llego_con.filter((x) => LLEGO_CON[f.tipo].includes(x));
    f.estado_recibido = f.estado_recibido.filter((x) => ESTADO_RECIBIDO[f.tipo].includes(x));
    zonaTipo.replaceChildren(
      f.tipo === 'otro' ? campo('tipo_otro', '¿Qué es? *', { placeholder: 'Ej: Reloj inteligente, tablet, parlante…' }) : el('span'),
      el('span', { class: 'st-etiqueta', text: 'Llegó con' }),
      selectorVarios(LLEGO_CON[f.tipo], f.llego_con, (v) => { f.llego_con = v; }),
      campo('llego_con_otro', 'Otro (escribe)', { placeholder: 'Ej: estuche' }),
      el('span', { class: 'st-etiqueta', text: 'Cómo llegó el equipo' }),
      selectorVarios(ESTADO_RECIBIDO[f.tipo], f.estado_recibido, (v) => { f.estado_recibido = v; }),
      campo('estado_recibido_otro', 'Otro (escribe)', { placeholder: 'Ej: le falta un tornillo' }));
  };
  pintarTipo();

  const fotosCaja = el('div', { class: 'st-fotos' });
  const pintarFotos = () => fotosCaja.replaceChildren(...fotos.map((x, i) => el('figure', { class: 'st-foto' },
    el('img', { src: URL.createObjectURL(x.blob), alt: '' }),
    el('figcaption', {}, x.etiqueta, ' ', el('button', { type: 'button', class: 'btn-enlace', onclick: () => { fotos.splice(i, 1); pintarFotos(); } }, 'Quitar')))));

  const guardar = el('button', { type: 'button', class: 'grande btn-principal st-grande', onclick: async () => {
    if (!f.cliente.trim()) { toast('Escribe el nombre del cliente'); entradas.cliente.focus(); return; }
    if (f.tipo === 'otro' && !f.tipo_otro.trim()) { toast('Escribe qué equipo es'); entradas.tipo_otro?.focus(); return; }
    if (!f.falla.trim()) { toast('Escribe qué le pasa al equipo'); entradas.falla.focus(); return; }
    guardar.disabled = true; guardar.textContent = 'Guardando…';
    try {
      const g = await datos.crear({ ...f, valor_compra: Number(f.valor_compra) || 0, limite: aISO(limite) });
      for (const x of fotos) await datos.subirFoto(g.id, x.blob, x.etiqueta, 'recibido').catch((e) => console.error(e));
      toast('🛡️ Garantía recibida');
      if (g.telefono) {
        const enviar = await confirmar({ titulo: '¿Avisar al cliente?', mensaje: 'Se abre WhatsApp Business con el comprobante: equipo, falla y el tiempo de respuesta (30 días hábiles).',
          textoAceptar: '💬 Enviar comprobante', peligro: false });
        if (enviar) avisar(g, mensajeRecibida(g), 'Se envió el comprobante de garantía por WhatsApp.');
      }
      await recargar();
      est.tab = 'tramite';
      await abrirFicha(g.id);
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar.', 5000);
      guardar.disabled = false; guardar.textContent = 'Guardar garantía';
    }
  } }, 'Guardar garantía');

  est.contenedor.replaceChildren(
    encabezado('＋ Recibir garantía', 'Datos del cliente y del equipo', () => { est.vista = 'lista'; render(); }),
    el('div', { class: 'st-cuerpo lista st-form' },
      el('span', { class: 'st-etiqueta', text: '¿Qué equipo es?' }),
      selectorUnico(Object.entries(TIPOS), f.tipo, (v) => { f.tipo = v; pintarTipo(); }),
      el('h3', { class: 'gr-subtitulo', text: '👤 Cliente' }),
      campo('cliente', 'Nombre completo *', { autocomplete: 'off' }),
      el('div', { class: 'dos' }, campo('cedula', 'Cédula', { inputmode: 'numeric' }), campo('telefono', 'Teléfono (WhatsApp)', { inputmode: 'tel' })),
      el('h3', { class: 'gr-subtitulo', text: '📦 Equipo y compra' }),
      el('div', { class: 'dos' }, campo('equipo', 'Marca y modelo', { placeholder: 'Ej: JBL Flip 6' }), campo('serial', 'IMEI / serial', { placeholder: 'Opcional' })),
      el('div', { class: 'dos' }, campo('fecha_compra', 'Fecha de compra', { type: 'date', max: aISO(new Date()) }),
        campo('valor_compra', 'Valor del aparato', { dinero: true, min: 0 })),
      campo('factura', 'N.º de factura o recibo (opcional)'),
      el('h3', { class: 'gr-subtitulo', text: '⚠️ La garantía' }),
      campo('falla', '¿Qué le pasa? (lo que dice el cliente) *', { multilinea: true, placeholder: 'Ej: No carga, se apaga solo' }),
      campo('motivo', '¿Por qué se manda a garantía? (lo que revisó la tienda)', { multilinea: true, placeholder: 'Ej: Se probó con otro cargador y tampoco carga' }),
      zonaTipo,
      el('span', { class: 'st-etiqueta', text: '📷 Fotos de cómo llega el equipo' }), fotosCaja,
      botonFoto(async (archivo) => {
        try {
          fotos.push({ blob: await aBlob(archivo), etiqueta: `Cómo llegó ${fotos.length + 1}` });
          pintarFotos();
        } catch { toast('No se pudo leer la foto.'); }
      }, '📷 Tomar foto'),
      el('div', { class: 'gr-aviso' },
        el('strong', { text: '⏳ Tiempo de respuesta: hasta 30 días hábiles' }),
        el('p', { class: 'gr-fecha-max' }, el('small', { text: '📅 Fecha máxima de respuesta' }), el('b', { text: fechaMaxima.format(limite) })),
        el('span', { text: 'Se cuenta desde mañana: el día en que se recibe no cuenta. Solo lunes a viernes, sin festivos.' })),
      guardar),
  );
  window.scrollTo({ top: 0 });
}
