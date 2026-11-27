// ─────────────────────────────────────────────────────────────
// SERVICIO TÉCNICO · pantallas y acciones
// Pestañas: Activos → Por entregar → Entregados.
// Ficha del celular: historial del arreglo, claves, fotos, dinero.
// Recibir equipo: formulario (la IA puede llenarlo por voz, texto o foto).
// SEGURIDAD: todo texto se pinta con textContent (vía el()).
// ─────────────────────────────────────────────────────────────
import { el, toast, confirmar } from '../ui.js';
import * as datos from './datos.js';
import { abrirHoja } from './hoja.js';
import { seccion, campoTexto, botonesHoja, selectorUnico, selectorVarios } from './formulario.js';
import { dibujoPatron, crearEditorPatron } from '../patron.js';
import * as wa from './whatsapp.js';
import { prepararFoto, puedeGrabar, empezarGrabacion } from '../media.js';
import { procesarOrdenIA } from '../ia.js';
import { crearEditorTrabajos, tablaTrabajos, trabajosDe } from './trabajos.js';

const TECNICOS = ['Osman', 'Erwin'];
const LLEGO_CON = ['SIM', 'Memoria', 'Forro', 'Cargador', 'Caja'];
const ESTADO_RECIBIDO = ['Pantalla rota', 'Rayones', 'Golpes', 'Mojado', 'No enciende'];
const METODOS = { efectivo: '💵 Efectivo', qr: '📱 QR', transferencia: '🏦 Transferencia' };
const MOMENTOS = { recibido: 'Al recibir', trabajo: 'Lo que se encontró', resultado: 'Lo que se hizo' };
const DIAS_FOTOS = 30;
const DIAS_RECLAMO = 30;

const est = {
  modo: 'demo',
  contenedor: null,
  onInicio: null,
  ordenes: [],
  tab: 'activo',
  busqueda: '',
  vista: 'lista', // 'lista' | 'ficha' | 'recibir'
  id: null,
  detalle: null,
  verClaves: false,
  visible: false,
  suscrito: false,
  onCambio: null,
};

const pesos = wa.pesos;
const dias = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const haceTexto = (iso) => {
  const d = dias(iso);
  if (d <= 0) {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    return h <= 0 ? 'hace un momento' : `hace ${h} h`;
  }
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
};
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const diaLargo = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const soloFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const falta = (o) => Math.max(0, (o.precio || 0) - (o.pagado || 0));

// ── Arranque ─────────────────────────────────────────────────

export async function iniciarServicio({ modo, contenedor, onInicio, onCambio }) {
  est.modo = modo;
  est.onCambio = onCambio;
  est.contenedor = contenedor;
  est.onInicio = onInicio;
  await datos.usar(modo);
  if (!est.suscrito) { datos.suscribir(() => recargar()); est.suscrito = true; }
  await recargar();
}

export function contar() {
  return {
    activos: est.ordenes.filter((o) => o.estado === 'activo').length,
    porEntregar: est.ordenes.filter((o) => o.estado === 'por_entregar').length,
  };
}

/** Entra al apartado (desde el inicio). */
export async function mostrar() {
  est.visible = true;
  est.vista = 'lista';
  render();
  datos.limpiarFotosVencidas().catch((e) => console.warn('fotos vencidas:', e));
  await recargar();
}

export function ocultar() { est.visible = false; }

async function recargar() {
  try {
    est.ordenes = await datos.listarOrdenes();
    if (est.vista === 'ficha' && est.id) est.detalle = await datos.detalle(est.id);
  } catch (error) {
    console.error('servicio:', error);
  }
  est.onCambio?.();
  if (est.visible && est.vista !== 'recibir') render();
}

// ── Render general ───────────────────────────────────────────

function render() {
  if (!est.contenedor) return;
  if (est.vista === 'ficha' && est.detalle) est.contenedor.replaceChildren(...vistaFicha(est.detalle));
  else if (est.vista === 'recibir') return; // el formulario se maneja solo
  else est.contenedor.replaceChildren(...vistaLista());
}

function encabezado(titulo, sub, { volver, acciones = [] } = {}) {
  return el('header', { class: 'encabezado st-encabezado' },
    el('button', { type: 'button', class: 'btn btn-secundario st-volver', onclick: volver }, '‹'),
    el('div', { class: 'st-titulo' }, el('h1', { class: 'marca-nombre', text: titulo }), sub ? el('p', { class: 'marca-sub', text: sub }) : null),
    el('div', { class: 'encabezado-acciones' }, ...acciones),
  );
}

// ── Lista con tres pestañas ──────────────────────────────────

function vistaLista() {
  const por = (e, campo, dir = -1) => est.ordenes.filter((o) => o.estado === e)
    .sort((a, b) => dir * (new Date(a[campo]) - new Date(b[campo])));
  const activos = por('activo', 'creado_en');            // los más nuevos arriba
  const porEntregar = por('por_entregar', 'listo_en', 1); // los que llevan más días arriba
  const entregados = por('entregado', 'entregado_en');   // los últimos entregados arriba
  const q = est.busqueda.trim().toLowerCase();
  const coincide = (o) => !q || [o.cliente, o.telefono, o.equipo, o.imei, String(o.numero)].some((v) => String(v || '').toLowerCase().includes(q));
  const lista = { activo: activos, por_entregar: porEntregar, entregado: entregados }[est.tab].filter(coincide);

  const pestana = (id, texto, n) => el('button', {
    type: 'button', role: 'tab', class: 'segmento', 'aria-selected': String(est.tab === id),
    onclick: () => { est.tab = id; render(); est.contenedor.querySelector('.st-cuerpo')?.classList.add('entrando'); },
  }, texto, el('span', { class: 'contador', text: String(n) }));

  const buscador = el('input', {
    type: 'search', class: 'st-buscar', placeholder: '🔍 Buscar nombre, teléfono, IMEI…', value: est.busqueda,
    'aria-label': 'Buscar', oninput: (e) => {
      est.busqueda = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const nuevo = est.contenedor.querySelector('.st-buscar');
      nuevo.focus();
      nuevo.setSelectionRange(pos, pos);
    },
  });

  let tarjetas;
  if (!lista.length) {
    tarjetas = [el('div', { class: 'vacio-estado' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: q ? '🔍' : { activo: '🔧', por_entregar: '📦', entregado: '🗂️' }[est.tab] }),
      el('h2', { class: 'vacio-titulo', text: q ? 'Sin resultados' : { activo: 'No hay equipos en el taller', por_entregar: 'Nada por entregar', entregado: 'Aún no hay entregados' }[est.tab] }),
      est.tab === 'activo' && !q ? el('p', { class: 'vacio-texto', text: 'Toca "＋ Recibir equipo" cuando llegue uno.' }) : null)];
  } else if (est.tab === 'entregado') {
    tarjetas = porDia(lista);
  } else {
    tarjetas = [el('ul', { class: 'tarjetas' }, ...lista.map(est.tab === 'activo' ? tarjetaActivo : tarjetaPorEntregar))];
  }

  return [
    encabezado('🔧 Servicio técnico', `${activos.length} activos · ${porEntregar.length} por entregar`, {
      volver: () => est.onInicio?.(),
      acciones: [el('button', { type: 'button', class: 'btn btn-secundario', onclick: abrirCaja }, '💵 Caja')],
    }),
    el('div', { class: 'st-cuerpo lista' },
      buscador,
      el('div', { class: 'segmentos segmentos-3', role: 'tablist' },
        pestana('activo', 'Activos', activos.length),
        pestana('por_entregar', 'Por entregar', porEntregar.length),
        pestana('entregado', 'Entregados', entregados.length)),
      ...tarjetas),
    est.tab === 'activo' ? el('button', { type: 'button', class: 'st-fab', onclick: abrirRecibir }, '＋ Recibir equipo') : null,
  ].filter(Boolean);
}

function lineaCliente(o) {
  return [o.cliente, o.telefono, `🔧 ${o.tecnico}`].filter(Boolean).join(' · ');
}

function tarjetaActivo(o) {
  return el('li', { class: 'tarjeta st-tarjeta', onclick: () => abrirFicha(o.id) },
    el('div', { class: 'tarjeta-info' },
      el('div', { class: 'st-fila' }, el('h4', { class: 'tarjeta-modelo', text: o.equipo || 'Equipo' }), el('span', { class: 'st-num', text: `#${o.numero}` })),
      el('p', { class: 'tarjeta-detalle', text: lineaCliente(o) }),
      o.problema ? el('p', { class: 'st-problema', text: `🔧 ${o.problema}` }) : null,
      o.trabajos?.length ? el('p', { class: 'st-trabajos-linea', text: `🧾 ${o.trabajos.map((t) => t.descripcion).join(' + ')}` }) : null,
      el('div', { class: 'st-fila st-pie' }, el('span', { text: `Llegó ${haceTexto(o.creado_en)}` }), el('strong', { text: pesos(o.precio) }))));
}

function etiquetaPago(o) {
  if (o.resultado === 'no_reparado') return el('span', { class: 'etiqueta etiqueta-no-hay', text: 'No reparado' });
  return falta(o)
    ? el('span', { class: 'etiqueta st-debe', text: `Debe ${pesos(falta(o))}` })
    : el('span', { class: 'etiqueta etiqueta-comprado', text: 'Pagado ✓' });
}

function tarjetaPorEntregar(o) {
  const d = dias(o.listo_en);
  const aviso = d >= DIAS_RECLAMO ? 'st-vencido' : d >= DIAS_RECLAMO - 5 ? 'st-por-vencer' : '';
  return el('li', { class: 'tarjeta st-tarjeta', onclick: () => abrirFicha(o.id) },
    el('div', { class: 'tarjeta-info' },
      el('div', { class: 'st-fila' }, el('h4', { class: 'tarjeta-modelo', text: o.equipo || 'Equipo' }), etiquetaPago(o)),
      el('p', { class: 'tarjeta-detalle', text: lineaCliente(o) }),
      o.resumen ? el('p', { class: 'st-problema', text: `🔧 ${o.resumen}` }) : null,
      el('p', { class: `st-dias ${aviso}`, text: d >= DIAS_RECLAMO ? `⚠️ Listo hace ${d} días: pasó el plazo de 30 días`
        : `Listo ${haceTexto(o.listo_en)}${aviso ? ' · se acerca el plazo de 30 días' : ''}` }),
      el('div', { class: 'st-botones' },
        el('button', { type: 'button', class: 'btn btn-secundario', onclick: (e) => { e.stopPropagation(); recordar(o); } }, '💬 Recordar'),
        el('button', { type: 'button', class: 'btn btn-exito', onclick: (e) => { e.stopPropagation(); cobrarYEntregar(o); } }, '💵 Cobrar y entregar'))));
}

function porDia(lista) {
  const nodos = [];
  let dia = '';
  let ul = null;
  for (const o of lista) {
    const f = new Date(o.entregado_en);
    const hoy = new Date();
    const nombre = f.toDateString() === hoy.toDateString() ? 'Hoy'
      : f.toDateString() === new Date(Date.now() - 86_400_000).toDateString() ? 'Ayer' : diaLargo.format(f);
    if (nombre !== dia) {
      dia = nombre;
      nodos.push(el('h3', { class: 'grupo-titulo', text: nombre }));
      ul = el('ul', { class: 'tarjetas' });
      nodos.push(ul);
    }
    ul.append(el('li', { class: 'tarjeta st-tarjeta', onclick: () => abrirFicha(o.id) },
      el('div', { class: 'tarjeta-info' },
        el('div', { class: 'st-fila' }, el('h4', { class: 'tarjeta-modelo', text: o.equipo || 'Equipo' }), etiquetaPago(o)),
        el('p', { class: 'tarjeta-detalle', text: `${o.cliente} · ${o.telefono}` }),
        el('div', { class: 'st-fila st-pie' },
          el('span', { text: [o.resumen || o.problema, o.entregado_por && `entregó ${o.entregado_por}`].filter(Boolean).join(' · ') }), el('strong', { text: pesos(o.precio) })))));
  }
  nodos.push(el('p', { class: 'st-candado', text: '🔒 Los entregados quedan guardados para siempre: no se pueden borrar.' }));
  return nodos;
}

// ── Ficha del celular ────────────────────────────────────────

async function abrirFicha(id) {
  est.id = id;
  est.vista = 'ficha';
  est.verClaves = false;
  try {
    est.detalle = await datos.detalle(id);
  } catch (error) {
    console.error(error);
    toast('No se pudo abrir la orden.');
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


function vistaFicha({ orden: o, eventos, pagos, fotos }) {
  const entregado = o.estado === 'entregado';
  const estadoTexto = { activo: '🔧 En el taller', por_entregar: o.resultado === 'no_reparado' ? '↩️ Por entregar (no reparado)' : '✅ Listo para entregar',
    entregado: o.resultado === 'no_reparado' ? '🔒 Entregado sin reparar' : '🔒 Entregado' }[o.estado];

  const datosCliente = el('dl', { class: 'st-datos' },
    ...[['Cliente', o.cliente], ['Teléfono', o.telefono], ['Equipo', o.equipo], ['IMEI', o.imei], ['Problema', o.problema],
      ['Llegó con', [...o.llego_con, o.llego_con_otro && `Otro: ${o.llego_con_otro}`].filter(Boolean).join(', ')],
      ['Al recibir', [...o.estado_recibido, o.estado_recibido_otro && `Otro: ${o.estado_recibido_otro}`].filter(Boolean).join(', ')],
      ['Técnico', o.tecnico], ['Recibió', `${o.creado_por} · ${fechaCorta.format(new Date(o.creado_en))}`],
      ...(entregado ? [['Entregó', `${o.entregado_por} · ${fechaCorta.format(new Date(o.entregado_en))}`]] : [])]
      .filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  const nodos = [
    encabezado(o.equipo || 'Equipo', `#${o.numero} · ${estadoTexto}`, { volver: volverALista }),
    el('div', { class: 'st-cuerpo lista st-ficha' },
      seccion('👤 Cliente y equipo', datosCliente,
        el('div', { class: 'st-botones' },
          o.telefono ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => wa.abrirWhatsApp(o.telefono, `Hola ${o.cliente.split(' ')[0]} 👋, le escribe *RH Tecnology*.`) }, '💬 WhatsApp') : null,
          !entregado ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => editarDatos(o) }, '✏️ Editar datos') : null)),
      seccionClaves(o, entregado),
      seccion('🧾 Historial del arreglo', historial(eventos),
        el('div', { class: 'st-botones' },
          !entregado ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => agregarTexto(o, 'trabajo') }, '📝 Agregar trabajo') : null,
          entregado ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => agregarTexto(o, 'nota') }, '📝 Agregar nota') : null)),
      seccionFotos(o, fotos, entregado),
      seccionDinero(o, pagos, entregado),
      ...accionesFicha(o)),
  ];
  return nodos;
}

function historial(eventos) {
  const colores = { precio: 'var(--aviso-texto)', listo: 'var(--exito)', entregado: 'var(--exito)', devuelto: 'var(--peligro)', formateo: 'var(--peligro)',
    nota: 'var(--marca-celeste)', recibido: 'var(--texto-suave)', pago: 'var(--exito)' };
  return el('ol', { class: 'st-historial' }, ...eventos.map((e) => el('li', { class: 'st-evento', style: `--c:${colores[e.tipo] ?? 'var(--marca-brillante)'}` },
    el('small', { text: `${fechaCorta.format(new Date(e.creado_en))} · ${e.autor}` }),
    el('span', { text: e.texto }))));
}

function seccionClaves(o, entregado) {
  const claves = Array.isArray(o.claves) ? o.claves : [];
  const ordenadas = [...claves.map((c, i) => ({ ...c, i }))].sort((a, b) => (b.funciono === true) - (a.funciono === true));
  const cuerpo = [];
  if (!claves.length) cuerpo.push(el('p', { class: 'st-nota', text: '🔓 Sin clave' }));
  else if (!est.verClaves) {
    cuerpo.push(el('button', { type: 'button', class: 'btn btn-secundario st-ver', onclick: () => { est.verClaves = true; render(); } },
      `🔒 Ver ${claves.length === 1 ? 'clave' : `${claves.length} claves`}`));
  } else {
    cuerpo.push(...ordenadas.map((c) => el('div', { class: `st-clave ${c.funciono === true ? 'ok' : c.funciono === false ? 'no' : ''}` },
      c.tipo === 'patron' ? dibujoPatron(c.valor, 96) : el('div', { class: 'st-pin', text: c.valor }),
      el('div', { class: 'st-clave-info' },
        el('strong', { text: c.tipo === 'patron' ? 'Patrón' : 'PIN / contraseña' }),
        c.nota ? el('small', { text: c.nota }) : null,
        c.funciono === true ? el('span', { class: 'etiqueta etiqueta-comprado', text: '✓ Esta funcionó' })
          : c.funciono === false ? el('span', { class: 'etiqueta etiqueta-no-hay', text: '✗ No sirvió' }) : null,
        !entregado ? el('div', { class: 'st-mini' },
          el('button', { type: 'button', onclick: () => marcarClave(o, c.i, true) }, '✓ Funcionó'),
          el('button', { type: 'button', onclick: () => marcarClave(o, c.i, false) }, '✗ No sirvió')) : null))));
    cuerpo.push(el('button', { type: 'button', class: 'btn-enlace', onclick: () => { est.verClaves = false; render(); } }, 'Ocultar claves'));
  }
  return seccion('🔒 Bloqueo', ...cuerpo,
    !entregado ? el('div', { class: 'st-botones' },
      el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => agregarClave(o) }, '＋ Agregar clave'),
      el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => autorizarFormateo(o) }, '⚠️ Ninguna sirve')) : null);
}

function seccionFotos(o, fotos, entregado) {
  const vivas = fotos.filter((f) => !f.borrada_en);
  const borradas = fotos.length - vivas.length;
  const vence = vivas.length ? new Date(new Date(vivas[0].creado_en).getTime() + DIAS_FOTOS * 86_400_000) : null;
  return seccion(`📷 Fotos (${vivas.length})`,
    vence ? el('p', { class: 'st-nota st-aviso', text: `⏳ Se borran solas al mes (la primera el ${soloFecha.format(vence)})` }) : null,
    vivas.length ? el('div', { class: 'st-fotos' }, ...vivas.map((f) => el('figure', { class: 'st-foto' },
      f.url ? el('img', { src: f.url, alt: f.etiqueta || 'Foto', loading: 'lazy', onclick: () => window.open(f.url, '_blank', 'noopener') })
        : el('div', { class: 'st-foto-vacia', text: '📷' }),
      el('figcaption', { text: `${f.etiqueta || MOMENTOS[f.momento]}${f.visible_cliente ? ' · 👁️' : ''}` })))) : null,
    borradas ? el('p', { class: 'st-nota', text: `🗑️ ${borradas} ${borradas === 1 ? 'foto se borró' : 'fotos se borraron'} sola${borradas === 1 ? '' : 's'} (pasó 1 mes).` }) : null,
    !vivas.length && !borradas ? el('p', { class: 'st-nota', text: 'Sin fotos todavía.' }) : null,
    !entregado ? el('div', { class: 'st-botones' }, botonFoto(o)) : null);
}

function botonFoto(o) {
  const entrada = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async (e) => {
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (archivo) await agregarFoto(o, archivo);
    } });
  return el('label', { class: 'btn btn-secundario' }, '📷 Agregar foto', entrada);
}

function seccionDinero(o, pagos, entregado) {
  const noReparado = o.resultado === 'no_reparado';
  return seccion('💵 Trabajos y dinero',
    noReparado ? el('p', { class: 'st-nota st-aviso', text: `↩️ No se reparó: se cobra ${pesos(o.precio)} por la revisión.` }) : tablaTrabajos(o),
    el('div', { class: 'st-plata' },
      el('div', {}, el('small', { text: 'Total' }), el('b', { text: pesos(o.precio) })),
      el('div', {}, el('small', { text: entregado ? 'Pagó' : 'Abonó' }), el('b', { text: pesos(o.pagado) })),
      el('div', {}, el('small', { text: 'Falta' }), el('b', { class: falta(o) ? 'st-debe-txt' : 'st-ok-txt', text: pesos(falta(o)) }))),
    pagos.length ? el('ul', { class: 'st-pagos' }, ...pagos.map((p) => el('li', {},
      el('span', { text: `${soloFecha.format(new Date(p.creado_en))} · ${p.tipo === 'abono' ? 'Abono' : 'Pago'} · ${METODOS[p.metodo]}` }),
      el('strong', { text: pesos(p.monto) })))) : null,
    !entregado ? el('div', { class: 'st-botones' },
      !noReparado ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => editarTrabajos(o) },
        o.estado === 'activo' ? '🧾 Trabajos y precios' : '🏷️ Precios / descuento') : null,
      el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => registrarAbono(o) }, '＋ Registrar abono')) : null);
}

function accionesFicha(o) {
  if (o.estado === 'activo') {
    return [
      el('button', { type: 'button', class: 'grande btn-exito st-grande', onclick: () => marcarListo(o) }, '✅ Marcar como listo y avisar al cliente'),
      el('button', { type: 'button', class: 'btn btn-peligro-suave st-ancho', onclick: () => devolver(o) }, '↩️ Devolver sin reparar'),
    ];
  }
  if (o.estado === 'por_entregar') {
    return [
      el('button', { type: 'button', class: 'grande btn-exito st-grande', onclick: () => cobrarYEntregar(o) }, '💵 Cobrar y entregar'),
      el('div', { class: 'st-botones' },
        el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => recordar(o) }, '💬 Recordar por WhatsApp'),
        el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => copiarEnlace(o) }, '🔗 Enlace de fotos'),
        el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => reabrir(o) }, '↺ Volver al taller')),
    ];
  }
  return [el('p', { class: 'st-candado', text: '🔒 Entregado: esta orden queda guardada para siempre y no se puede borrar ni cambiar (solo agregar notas).' })];
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



async function agregarTexto(o, tipo) {
  const texto = await abrirHoja(tipo === 'nota' ? '📝 Agregar nota' : '📝 Agregar trabajo', (cerrar) => {
    const t = campoTexto(tipo === 'nota' ? 'Nota (queda en el historial, no se puede borrar)' : 'Qué se hizo o qué se encontró',
      { multilinea: true, placeholder: tipo === 'nota' ? 'Ej: El cliente volvió, se revisó gratis' : 'Ej: Se cambió el pin. No funcionó.' });
    return [t.nodo, botonesHoja(cerrar, 'Guardar', () => cerrar(t.entrada.value.trim()))];
  });
  if (texto) await trabajar(datos.agregarEvento(o.id, tipo, texto), '📝 Guardado en el historial');
}

/** Agregar, quitar o cambiar trabajos (con su precio) y el descuento. */
async function editarTrabajos(o) {
  const r = await abrirHoja('🧾 Trabajos y precios', (cerrar) => {
    const editor = crearEditorTrabajos({ trabajos: trabajosDe(o), descuento: o.descuento });
    const motivo = campoTexto('¿Por qué cambia? (opcional, queda en el historial)', { placeholder: 'Ej: Después de la pantalla, el pin tampoco cargaba' });
    const avisar = el('input', { type: 'checkbox', checked: Boolean(o.telefono) });
    return [
      el('p', { class: 'st-nota', text: `Total actual: ${pesos(o.precio)}` }),
      editor.nodo, motivo.nodo,
      o.telefono ? el('label', { class: 'st-check' }, avisar, 'Avisar al cliente por WhatsApp si cambia el total') : null,
      botonesHoja(cerrar, 'Guardar', () => {
        const v = editor.valor();
        if (!v.trabajos.length) { toast('Agrega al menos un trabajo'); return; }
        cerrar({ ...v, motivo: motivo.entrada.value.trim(), avisar: avisar.checked });
      }),
    ];
  });
  if (!r) return;
  const n = await trabajar(datos.guardarTrabajos(o.id, r.trabajos, r.descuento, r.motivo), '🧾 Trabajos guardados');
  if (n && r.avisar && o.telefono && r.total !== o.precio) {
    wa.abrirWhatsApp(o.telefono, wa.mensajePrecio({ ...o, trabajos: r.trabajos, descuento: r.descuento, precio: r.total }, o.precio, r.motivo));
    datos.agregarEvento(o.id, 'whatsapp', `Se avisó al cliente el nuevo valor (${pesos(r.total)}).`).catch(() => {});
  }
}

async function registrarAbono(o) {
  const r = await abrirHoja('＋ Registrar abono', (cerrar) => {
    const monto = campoTexto('Valor', { dinero: true, min: 1 });
    let metodo = 'efectivo';
    const chips = selectorUnico(Object.entries(METODOS), metodo, (v) => { metodo = v; });
    return [monto.nodo, el('span', { class: 'st-etiqueta', text: 'Cómo pagó' }), chips,
      botonesHoja(cerrar, 'Guardar', () => cerrar({ monto: Number(monto.entrada.value), metodo }))];
  });
  if (r?.monto > 0) await trabajar(datos.registrarAbono(o.id, r.monto, r.metodo), '💵 Abono registrado');
}



async function agregarFoto(o, archivo) {
  let blob;
  try {
    const foto = await prepararFoto(archivo, 1100);
    blob = await (await fetch(`data:${foto.mime};base64,${foto.base64}`)).blob();
  } catch {
    toast('No se pudo leer la foto.');
    return;
  }
  const r = await abrirHoja('📷 Nueva foto', (cerrar) => {
    let momento = o.estado === 'activo' ? 'trabajo' : 'resultado';
    const etiqueta = campoTexto('¿Qué muestra?', { placeholder: 'Ej: Tarjeta de carga dañada' });
    return [
      el('img', { class: 'st-vista-previa', src: URL.createObjectURL(blob), alt: '' }),
      etiqueta.nodo,
      selectorUnico(Object.entries(MOMENTOS), momento, (v) => { momento = v; }),
      botonesHoja(cerrar, 'Guardar foto', () => cerrar({ etiqueta: etiqueta.entrada.value.trim(), momento })),
    ];
  });
  if (r) await trabajar(datos.subirFoto(o.id, blob, r.etiqueta, r.momento), '📷 Foto guardada');
}

async function marcarClave(o, indice, funciono) {
  const claves = o.claves.map((c, i) => (i === indice ? { ...c, funciono } : funciono ? { ...c, funciono: c.funciono === true ? null : c.funciono } : c));
  const c = o.claves[indice];
  await trabajar(datos.actualizarOrden(o.id, {
    claves, nota_clave: `${c.tipo === 'patron' ? 'Patrón' : 'PIN'}${c.nota ? ` (${c.nota})` : ''}: ${funciono ? 'funcionó ✓' : 'no sirvió ✗'}`,
  }));
}

/** Hoja para agregar una clave (PIN o patrón). Devuelve la clave o null. */
function pedirClave() {
  return abrirHoja('🔒 Agregar clave', (cerrar) => {
    let tipo = 'patron';
    let patron = [];
    const pin = campoTexto('PIN o contraseña', { placeholder: 'Ej: 1985' });
    const nota = campoTexto('Nota (opcional)', { placeholder: 'Ej: su año de nacimiento' });
    const editor = crearEditorPatron({ tam: 240, onCambio: (s) => { patron = s; } });
    const zona = el('div', { class: 'st-zona-clave' });
    const pintar = () => zona.replaceChildren(...(tipo === 'patron'
      ? [el('p', { class: 'st-nota', text: 'Dibuja el patrón con el dedo, igual que en el celular del cliente. El 1 (verde) es el inicio.' }),
        editor.nodo, el('button', { type: 'button', class: 'btn-enlace', onclick: editor.borrar }, '↺ Borrar y repetir')]
      : [pin.nodo]));
    pintar();
    return [
      selectorUnico([['patron', '✍️ Patrón'], ['pin', '🔢 PIN / contraseña']], tipo, (v) => { tipo = v; pintar(); }),
      zona, nota.nodo,
      botonesHoja(cerrar, 'Guardar clave', () => {
        if (tipo === 'patron' && patron.length < 2) { toast('Dibuja el patrón (al menos 2 puntos)'); return; }
        if (tipo === 'pin' && !pin.entrada.value.trim()) { toast('Escribe el PIN o la contraseña'); return; }
        cerrar({ tipo, valor: tipo === 'patron' ? patron : pin.entrada.value.trim(), nota: nota.entrada.value.trim() });
      }),
    ];
  });
}

async function agregarClave(o) {
  const c = await pedirClave();
  if (c) await trabajar(datos.actualizarOrden(o.id, { claves: [...o.claves, c], nota_clave: `Se agregó una clave (${c.tipo === 'patron' ? 'patrón' : 'PIN'}).` }), '🔒 Clave guardada');
}

async function autorizarFormateo(o) {
  const r = await abrirHoja('⚠️ Ninguna clave sirve', (cerrar) => {
    const quien = campoTexto('¿Quién autorizó formatear?', { value: o.cliente });
    const como = campoTexto('¿Cómo autorizó?', { placeholder: 'Ej: en persona, por WhatsApp, por llamada' });
    return [
      el('p', { class: 'st-nota st-aviso', text: 'Formatear BORRA fotos, contactos y datos del cliente. Solo hazlo con su autorización: quedará anotada en el historial.' }),
      quien.nodo, como.nodo,
      botonesHoja(cerrar, 'Anotar autorización', () => cerrar({ quien: quien.entrada.value.trim(), como: como.entrada.value.trim() }), 'btn-peligro'),
    ];
  });
  if (r?.quien) {
    await trabajar(datos.agregarEvento(o.id, 'formateo',
      `El cliente no recuerda la clave. ${r.quien} autorizó formatear (se borran sus datos)${r.como ? ` · ${r.como}` : ''}.`), '⚠️ Autorización anotada');
  }
}

async function editarDatos(o) {
  const r = await abrirHoja('✏️ Editar datos', (cerrar) => {
    const c = {
      cliente: campoTexto('Cliente', { value: o.cliente }), telefono: campoTexto('Teléfono', { value: o.telefono, inputmode: 'tel' }),
      equipo: campoTexto('Equipo', { value: o.equipo }), imei: campoTexto('IMEI', { value: o.imei }),
      problema: campoTexto('Problema', { value: o.problema, multilinea: true }),
    };
    let tecnico = o.tecnico;
    return [...Object.values(c).map((x) => x.nodo),
      el('span', { class: 'st-etiqueta', text: 'Técnico' }),
      selectorUnico(TECNICOS.map((t) => [t, `🔧 ${t}`]), tecnico, (v) => { tecnico = v; }),
      botonesHoja(cerrar, 'Guardar', () => cerrar({ ...Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x.entrada.value.trim()])), tecnico }))];
  });
  if (r) await trabajar(datos.actualizarOrden(o.id, r), '✏️ Datos actualizados');
}

async function marcarListo(o) {
  const { eventos, fotos } = est.detalle;
  // Lo que se le hizo: los trabajos cobrados (y si no hay, lo anotado en el historial)
  const trabajos = trabajosDe(o).map((t) => t.descripcion);
  const pasos = trabajos.length ? trabajos : eventos.filter((e) => e.tipo === 'trabajo').map((e) => e.texto);
  const vivas = fotos.filter((f) => !f.borrada_en);
  const r = await abrirHoja('✅ Listo para entregar', (cerrar) => {
    const resumen = campoTexto('Lo que se le hizo (una línea por cosa; así le llega al cliente)', { multilinea: true, value: pasos.join('\n') });
    resumen.entrada.rows = Math.min(6, Math.max(3, pasos.length + 1));
    const elegidas = new Set(vivas.filter((f) => f.momento !== 'recibido').map((f) => f.id));
    const fotosNodo = vivas.length ? el('div', { class: 'st-fotos st-elegir' }, ...vivas.map((f) => {
      const fig = el('figure', { class: `st-foto ${elegidas.has(f.id) ? 'on' : ''}`, onclick: () => {
        elegidas.has(f.id) ? elegidas.delete(f.id) : elegidas.add(f.id);
        fig.classList.toggle('on', elegidas.has(f.id));
      } }, f.url ? el('img', { src: f.url, alt: '' }) : el('div', { class: 'st-foto-vacia', text: '📷' }), el('figcaption', { text: f.etiqueta || MOMENTOS[f.momento] }));
      return fig;
    })) : el('p', { class: 'st-nota', text: 'No hay fotos para enviar (puedes agregarlas antes).' });
    return [
      resumen.nodo,
      el('span', { class: 'st-etiqueta', text: '📷 Fotos que verá el cliente (toca para elegir)' }), fotosNodo,
      o.telefono ? null : el('p', { class: 'st-nota st-aviso', text: 'Esta orden no tiene teléfono: no se enviará WhatsApp.' }),
      botonesHoja(cerrar, o.telefono ? 'Enviar por WhatsApp y marcar listo' : 'Marcar listo', () => cerrar({
        pasos: resumen.entrada.value.split('\n').map((l) => l.trim()).filter(Boolean), fotos: [...elegidas],
      }), 'btn-whatsapp'),
    ];
  });
  if (!r) return;
  const n = await trabajar(datos.marcarListo(o.id, r.pasos.join(' · '), r.fotos), '✅ Marcado como listo');
  if (n && o.telefono) {
    const enlace = r.fotos.length ? wa.enlaceCliente(n.codigo ?? o.codigo) : '';
    wa.abrirWhatsApp(o.telefono, wa.mensajeListo({ ...o, ...n, pagado: o.pagado }, r.pasos, enlace));
    datos.agregarEvento(o.id, 'whatsapp', 'Se avisó al cliente por WhatsApp que está listo.').catch(() => {});
  }
}

async function devolver(o) {
  const r = await abrirHoja('↩️ Devolver sin reparar', (cerrar) => {
    const motivo = campoTexto('¿Por qué no se reparó? (obligatorio)', { multilinea: true, placeholder: 'Ej: No tiene arreglo / el cliente no aceptó el precio' });
    const cobro = campoTexto('Se cobra (revisión)', { dinero: true, value: 0, min: 0 });
    const avisar = el('input', { type: 'checkbox', checked: Boolean(o.telefono) });
    return [motivo.nodo, cobro.nodo, el('label', { class: 'st-check' }, avisar, 'Avisar al cliente por WhatsApp'),
      botonesHoja(cerrar, 'Devolver', () => {
        if (motivo.entrada.value.trim().length < 3) { toast('Escribe por qué no se reparó'); return; }
        cerrar({ motivo: motivo.entrada.value.trim(), cobro: Number(cobro.entrada.value) || 0, avisar: avisar.checked });
      }, 'btn-peligro')];
  });
  if (!r) return;
  const n = await trabajar(datos.devolverSinReparar(o.id, r.motivo, r.cobro), '↩️ Pasa a Por entregar (no reparado)');
  if (n && r.avisar && o.telefono) {
    wa.abrirWhatsApp(o.telefono, wa.mensajeDevuelto({ ...o, precio: r.cobro }, r.motivo));
    datos.agregarEvento(o.id, 'whatsapp', 'Se avisó al cliente que no se pudo reparar.').catch(() => {});
  }
}

async function reabrir(o) {
  const ok = await confirmar({ titulo: '¿Volver al taller?', mensaje: 'El equipo vuelve a "Activos" (por ejemplo, si se marcó listo por error).', textoAceptar: 'Volver al taller', peligro: false });
  if (ok) await trabajar(datos.reabrir(o.id, 'Se volvió a abrir'), '↺ Volvió a Activos');
}

function recordar(o) {
  if (!o.telefono) { toast('Esta orden no tiene teléfono.'); return; }
  wa.abrirWhatsApp(o.telefono, wa.mensajeRecordatorio(o, Math.max(1, dias(o.listo_en))));
  datos.agregarEvento(o.id, 'whatsapp', 'Se le recordó al cliente por WhatsApp.').catch(() => {});
}

async function copiarEnlace(o) {
  const enlace = wa.enlaceCliente(o.codigo);
  try { await navigator.clipboard.writeText(enlace); toast('🔗 Enlace copiado'); } catch { toast(enlace, 8000); }
}

async function cobrarYEntregar(o) {
  const pendiente = falta(o);
  const r = await abrirHoja(`💵 Cobrar y entregar · ${o.equipo}`, (cerrar) => {
    let metodo = 'efectivo';
    const montos = { efectivo: campoTexto('💵 Efectivo', { dinero: true, min: 0 }),
      qr: campoTexto('📱 QR', { dinero: true, min: 0 }),
      transferencia: campoTexto('🏦 Transferencia', { dinero: true, min: 0 }) };
    const unico = campoTexto('Valor recibido', { dinero: true, value: pendiente, min: 0 });
    const zona = el('div');
    const pintar = () => zona.replaceChildren(...(metodo === 'mixto' ? Object.values(montos).map((m) => m.nodo) : [unico.nodo]));
    pintar();
    return [
      o.resultado !== 'no_reparado' ? tablaTrabajos(o) : null,
      el('div', { class: 'st-plata' },
        el('div', {}, el('small', { text: 'Total' }), el('b', { text: pesos(o.precio) })),
        el('div', {}, el('small', { text: 'Abonó' }), el('b', { text: pesos(o.pagado) })),
        el('div', {}, el('small', { text: 'Falta' }), el('b', { class: pendiente ? 'st-debe-txt' : 'st-ok-txt', text: pesos(pendiente) }))),
      pendiente ? el('span', { class: 'st-etiqueta', text: '¿Cómo pagó lo que faltaba?' }) : el('p', { class: 'st-nota', text: 'Ya está pagado: solo confirma la entrega.' }),
      pendiente ? selectorUnico([...Object.entries(METODOS), ['mixto', '➗ Mixto']], metodo, (v) => { metodo = v; pintar(); }) : null,
      pendiente ? zona : null,
      botonesHoja(cerrar, pendiente ? '✓ Pagado · Entregar celular' : '✓ Entregar celular', () => {
        const pagos = !pendiente ? [] : metodo === 'mixto'
          ? Object.entries(montos).map(([m, c]) => ({ monto: Number(c.entrada.value) || 0, metodo: m })).filter((p) => p.monto > 0)
          : [{ monto: Number(unico.entrada.value) || 0, metodo }];
        const total = pagos.reduce((s, p) => s + p.monto, 0);
        if (total < pendiente) { toast(`Falta por pagar ${pesos(pendiente - total)}`); return; }
        cerrar(pagos);
      }, 'btn-exito'),
    ];
  });
  if (!r) return;
  const n = await trabajar(datos.entregar(o.id, r), '📦 Entregado: pasó a Entregados');
  if (n) {
    est.tab = 'entregado';
    volverALista();
    if (o.telefono) {
      const enviar = await confirmar({ titulo: '🙌 ¿Enviar agradecimiento?', mensaje: 'Se abre WhatsApp Business con un mensaje de "equipo entregado, muchas gracias".',
        textoAceptar: '💬 Enviar', peligro: false });
      if (enviar) {
        wa.abrirWhatsApp(o.telefono, wa.mensajeEntregado({ ...o, ...n }));
        datos.agregarEvento(o.id, 'whatsapp', 'Se envió el agradecimiento de entrega por WhatsApp.').catch(() => {});
      }
    }
  }
}

// ── Caja del día y copia de seguridad ────────────────────────

async function abrirCaja() {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  let pagos = [];
  try { pagos = await datos.pagosDesde(inicioDia.toISOString()); } catch (e) { console.error(e); }
  const por = Object.fromEntries(Object.keys(METODOS).map((m) => [m, pagos.filter((p) => p.metodo === m).reduce((s, p) => s + p.monto, 0)]));
  const total = Object.values(por).reduce((a, b) => a + b, 0);
  await abrirHoja('💵 Caja de hoy · Servicio técnico', (cerrar) => [
    el('div', { class: 'st-caja' },
      ...Object.entries(METODOS).map(([m, t]) => el('div', {}, el('small', { text: t }), el('b', { text: pesos(por[m]) }))),
      el('div', { class: 'st-caja-total' }, el('small', { text: 'Total' }), el('b', { text: pesos(total) }))),
    el('p', { class: 'st-nota', text: `${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'} hoy (abonos y pagos al entregar).` }),
    el('button', { type: 'button', class: 'btn btn-secundario st-ancho', onclick: () => { cerrar(); window.dispatchEvent(new CustomEvent('rh:copia')); } },
      '⬇️ Descargar copia de seguridad (todo)'),
  ]);
}

export async function datosParaCopia() {
  return datos.listo() ? datos.copia() : {};
}

// ── Recibir equipo ───────────────────────────────────────────

async function abrirRecibir() {
  est.vista = 'recibir';
  const f = {
    cliente: '', telefono: '', equipo: '', imei: '', problema: '', abono: '', metodo_abono: 'efectivo',
    tecnico: 'Osman', claves: [], llego_con: [], llego_con_otro: '', estado_recibido: [], estado_recibido_otro: '',
  };
  const fotos = [];
  let grabacion = null;

  const entradas = {};
  const campo = (clave, etiqueta, props = {}) => {
    const c = campoTexto(etiqueta, { value: f[clave], ...props, oninput: (e) => { f[clave] = e.target.value; } });
    entradas[clave] = c.entrada;
    return c.nodo;
  };
  const zonaClaves = el('div', { class: 'st-claves-lista' });
  const pintarClaves = () => zonaClaves.replaceChildren(
    ...(f.claves.length ? f.claves.map((c, i) => el('div', { class: 'st-clave' },
      c.tipo === 'patron' ? dibujoPatron(c.valor, 80) : el('div', { class: 'st-pin', text: c.valor }),
      el('div', { class: 'st-clave-info' }, el('strong', { text: `Opción ${i + 1} · ${c.tipo === 'patron' ? 'Patrón' : 'PIN'}` }), c.nota ? el('small', { text: c.nota }) : null,
        el('button', { type: 'button', class: 'btn-enlace', onclick: () => { f.claves.splice(i, 1); pintarClaves(); } }, 'Quitar'))))
      : [el('p', { class: 'st-nota', text: '🔓 Sin clave (o agrega una o varias si el cliente no está seguro)' })]));
  pintarClaves();

  const zonaChips = {};
  const chips = (clave, opciones) => {
    const caja = el('div');
    zonaChips[clave] = () => caja.replaceChildren(selectorVarios(opciones, f[clave], (v) => { f[clave] = v; }));
    zonaChips[clave]();
    return caja;
  };
  const metodoCaja = el('div');
  const tecnicoCaja = el('div');
  const pintarSel = () => {
    metodoCaja.replaceChildren(selectorUnico(Object.entries(METODOS), f.metodo_abono, (v) => { f.metodo_abono = v; }));
    tecnicoCaja.replaceChildren(selectorUnico(TECNICOS.map((t) => [t, `🔧 ${t}`]), f.tecnico, (v) => { f.tecnico = v; }));
  };
  pintarSel();

  const editor = crearEditorTrabajos();

  const fotosCaja = el('div', { class: 'st-fotos' });
  const pintarFotos = () => fotosCaja.replaceChildren(...fotos.map((b) => el('figure', { class: 'st-foto' }, el('img', { src: URL.createObjectURL(b), alt: '' }))));

  const estadoIA = el('p', { class: 'st-nota st-ia-estado', 'aria-live': 'polite' });
  const llenarConIA = async (entrada) => {
    if (est.modo !== 'supabase') { toast('La IA funciona al iniciar sesión (en modo demo, escribe los datos).'); return; }
    estadoIA.textContent = '⏳ La IA está llenando el formulario…';
    try {
      const { orden: d, transcripcion } = await procesarOrdenIA(entrada);
      for (const k of ['cliente', 'telefono', 'equipo', 'imei', 'problema', 'llego_con_otro', 'estado_recibido_otro']) {
        if (d[k]) { f[k] = d[k]; if (entradas[k]) { entradas[k].value = d[k]; entradas[k].classList.add('ia'); } }
      }
      if (d.abono) { f.abono = d.abono; entradas.abono.value = d.abono; entradas.abono.classList.add('ia'); }
      if (d.trabajos?.length) editor.poner(d.trabajos, d.descuento);
      else if (d.precio) editor.poner([{ descripcion: d.problema || 'Arreglo', precio: d.precio }], d.descuento);
      if (d.metodo_abono) f.metodo_abono = d.metodo_abono;
      if (d.tecnico) f.tecnico = d.tecnico;
      if (d.llego_con?.length) f.llego_con = d.llego_con;
      if (d.estado_recibido?.length) f.estado_recibido = d.estado_recibido;
      if (d.claves?.length) f.claves = d.claves;
      pintarSel(); pintarClaves(); zonaChips.llego_con(); zonaChips.estado_recibido();
      estadoIA.textContent = `✨ Listo: revisa los campos marcados${transcripcion ? ` · 🎙️ «${transcripcion}»` : ''}`;
    } catch (error) {
      console.error(error);
      estadoIA.textContent = `No se pudo usar la IA (${error.message}). Escribe los datos.`;
    }
  };

  const dictar = el('button', { type: 'button', class: 'st-ia-btn', onclick: async () => {
    if (grabacion) {
      const g = grabacion; grabacion = null; dictar.classList.remove('grabando'); dictar.textContent = '🎙️ Dictar';
      try { const a = await g.detener(); await llenarConIA({ audio: { base64: a.base64, mime: a.mime } }); } catch { toast('El audio salió vacío.'); }
      return;
    }
    if (!puedeGrabar()) { toast('Este navegador no permite grabar audio.'); return; }
    try {
      grabacion = await empezarGrabacion({ onLimite: () => dictar.click() });
      dictar.classList.add('grabando'); dictar.textContent = '⏹️ Terminar';
      estadoIA.textContent = '🔴 Grabando… di los datos del cliente y del equipo';
    } catch { toast('Permite el micrófono para dictar.'); }
  } }, '🎙️ Dictar');
  const fotoIA = el('label', { class: 'st-ia-btn' }, '📷 Foto', el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async (e) => {
      const a = e.target.files?.[0]; e.target.value = '';
      if (!a) return;
      try { const img = await prepararFoto(a); await llenarConIA({ imagen: img }); } catch { toast('No se pudo leer la foto.'); }
    } }));
  const textoIA = el('button', { type: 'button', class: 'st-ia-btn', onclick: async () => {
    const t = await abrirHoja('⌨️ Escribir los datos', (cerrar) => {
      const c = campoTexto('Escribe todo junto; la IA lo ordena', { multilinea: true, placeholder: 'Ej: Redmi 13C de Carlos Pérez 3001234567, no carga, patrón en L, 45 mil, abonó 20 mil por Nequi' });
      return [c.nodo, botonesHoja(cerrar, 'Llenar', () => cerrar(c.entrada.value.trim()))];
    });
    if (t) await llenarConIA({ texto: t });
  } }, '⌨️ Escribir');

  const guardar = el('button', { type: 'button', class: 'grande btn-principal st-grande', onclick: async () => {
    if (!f.cliente.trim()) { toast('Escribe el nombre del cliente'); entradas.cliente.focus(); return; }
    guardar.disabled = true; guardar.textContent = 'Guardando…';
    try {
      const { trabajos, descuento, total } = editor.valor();
      const o = await datos.crearOrden({ ...f, trabajos, descuento, precio: total, abono: Number(f.abono) || 0 });
      for (const b of fotos) await datos.subirFoto(o.id, b, 'Al recibir', 'recibido').catch((e) => console.error(e));
      toast('📥 Equipo recibido');
      if (o.telefono) {
        const enviar = await confirmar({ titulo: '¿Avisar al cliente?', mensaje: 'Se abre WhatsApp Business con el comprobante (equipo, valor, abono y condiciones del taller).', textoAceptar: '💬 Enviar comprobante', peligro: false });
        if (enviar) {
          wa.abrirWhatsApp(o.telefono, wa.mensajeRecibido(o, Number(f.abono) || 0));
          datos.agregarEvento(o.id, 'whatsapp', 'Se envió el comprobante de recibido por WhatsApp.').catch(() => {});
        }
      }
      await recargar();
      est.tab = 'activo';
      await abrirFicha(o.id);
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar.', 5000);
      guardar.disabled = false; guardar.textContent = 'Guardar equipo';
    }
  } }, 'Guardar equipo');

  est.contenedor.replaceChildren(
    encabezado('＋ Recibir equipo', 'La IA llena, tú revisas', { volver: () => { grabacion?.cancelar(); est.vista = 'lista'; render(); } }),
    el('div', { class: 'st-cuerpo lista st-form' },
      el('div', { class: 'st-ia' }, dictar, fotoIA, textoIA), estadoIA,
      el('div', { class: 'dos' }, campo('cliente', 'Cliente *', { autocomplete: 'off' }), campo('telefono', 'Teléfono (WhatsApp)', { inputmode: 'tel' })),
      el('div', { class: 'dos' }, campo('equipo', 'Equipo', { placeholder: 'Ej: Redmi 13C · azul' }), campo('imei', 'IMEI (opcional)', { placeholder: '*#06#' })),
      campo('problema', '¿Qué tiene? (lo que dice el cliente)', { multilinea: true }),
      el('span', { class: 'st-etiqueta', text: '🧾 Trabajos y precios (puedes agregar varios)' }), editor.nodo,
      campo('abono', 'Abono', { dinero: true, min: 0 }),
      el('span', { class: 'st-etiqueta', text: 'Cómo pagó el abono' }), metodoCaja,
      el('span', { class: 'st-etiqueta', text: 'Técnico' }), tecnicoCaja,
      el('span', { class: 'st-etiqueta', text: '🔒 Bloqueo del celular' }), zonaClaves,
      el('button', { type: 'button', class: 'btn btn-secundario', onclick: async () => { const c = await pedirClave(); if (c) { f.claves.push(c); pintarClaves(); } } }, '＋ Agregar clave (PIN o patrón)'),
      el('span', { class: 'st-etiqueta', text: 'Llegó con' }), chips('llego_con', LLEGO_CON), campo('llego_con_otro', 'Otro (escribe)', { placeholder: 'Ej: llavero' }),
      el('span', { class: 'st-etiqueta', text: 'Estado al recibir' }), chips('estado_recibido', ESTADO_RECIBIDO), campo('estado_recibido_otro', 'Otro (escribe)', { placeholder: 'Ej: tapa trasera despegada' }),
      el('span', { class: 'st-etiqueta', text: '📷 Fotos al recibir (opcional)' }), fotosCaja,
      el('label', { class: 'btn btn-secundario' }, '📷 Tomar foto del equipo', el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
        onchange: async (e) => {
          const a = e.target.files?.[0]; e.target.value = '';
          if (!a) return;
          try { const img = await prepararFoto(a, 1100); fotos.push(await (await fetch(`data:${img.mime};base64,${img.base64}`)).blob()); pintarFotos(); } catch { toast('No se pudo leer la foto.'); }
        } })),
      el('p', { class: 'st-nota', text: `Condiciones: ${wa.NEGOCIO.condiciones} ${wa.NEGOCIO.firma}` }),
      guardar),
  );
  window.scrollTo({ top: 0 });
}
