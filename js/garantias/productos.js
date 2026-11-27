// ─────────────────────────────────────────────────────────────
// GARANTÍAS · PRODUCTOS DEL LOCAL (devoluciones al proveedor)
// Productos que se prueban en la tienda y no sirven: qué es, cuánto
// costó, en qué local se compró y cuándo. Se devuelven al proveedor.
// Pestañas: Por devolver → Devueltos → Resueltos.
// Este archivo dibuja la lista, la ficha y el formulario; js/garantias/app.js
// le pasa el contenedor y las funciones comunes (ctx).
// ─────────────────────────────────────────────────────────────
import { el, toast } from '../ui.js';
import * as datos from './datos.js';
import { abrirHoja } from '../servicio/hoja.js';
import { seccion, campoTexto, botonesHoja, selectorUnico } from '../servicio/formulario.js';
import { pesos } from '../servicio/whatsapp.js';
import { aISO, deISO } from './habiles.js';

export const TIPOS_PRODUCTO = {
  celular: '📱 Celular', sonido: '🔊 Bafle / sonido', cable: '🔌 Cable', control: '🎮 Control',
  cargador: '🔋 Cargador', audifonos: '🎧 Audífonos', otro: '📦 Otro',
};
const icono = (t) => TIPOS_PRODUCTO[t]?.split(' ')[0] ?? '📦';
const RESULTADOS = { cambio: '🔄 Lo cambiaron', reembolso: '💵 Devolvieron el dinero', rechazado: '❌ No lo aceptaron' };

const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const soloFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const diasDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const hace = (iso) => { const d = diasDesde(iso); return d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`; };
const total = (d) => (d.costo || 0) * (d.cantidad || 1);

const est = { tab: 'pendiente', busqueda: '', vista: 'lista', id: null, detalle: null };

export function contarProductos(lista) {
  const pend = lista.filter((d) => d.estado === 'pendiente');
  const dev = lista.filter((d) => d.estado === 'devuelto');
  return { porDevolver: pend.length, devueltos: dev.length, plata: [...pend, ...dev].reduce((s, d) => s + total(d), 0) };
}

export const vistaActual = () => est.vista;
export const idActual = () => (est.vista === 'ficha' ? est.id : null);
export function ponerDetalle(d) { est.detalle = d; }
export function irALista() { est.vista = 'lista'; est.id = null; est.detalle = null; }

/** Lista de productos (va debajo del selector Clientes | Productos). */
export function vistaListaProductos(ctx, lista) {
  const q = est.busqueda.trim().toLowerCase();
  const por = (e) => lista.filter((d) => d.estado === e);
  const grupos = {
    pendiente: por('pendiente').sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
    devuelto: por('devuelto').sort((a, b) => a.devuelto_en.localeCompare(b.devuelto_en)),
    resuelto: por('resuelto').sort((a, b) => b.resuelto_en.localeCompare(a.resuelto_en)),
  };
  const coincide = (d) => !q || [d.producto, d.proveedor, d.factura, d.falla, String(d.numero)].some((v) => String(v || '').toLowerCase().includes(q));
  const visibles = grupos[est.tab].filter(coincide);
  const c = contarProductos(lista);

  const pestana = (id, texto) => el('button', {
    type: 'button', role: 'tab', class: 'segmento', 'aria-selected': String(est.tab === id),
    onclick: () => { est.tab = id; ctx.render(); },
  }, texto, el('span', { class: 'contador', text: String(grupos[id].length) }));

  const buscador = el('input', {
    type: 'search', class: 'st-buscar', placeholder: '🔍 Buscar producto, local, factura…', value: est.busqueda, 'aria-label': 'Buscar',
    oninput: (e) => {
      est.busqueda = e.target.value;
      const pos = e.target.selectionStart;
      ctx.render();
      const nuevo = ctx.contenedor().querySelector('.st-buscar');
      nuevo.focus();
      nuevo.setSelectionRange(pos, pos);
    },
  });

  const vacio = { pendiente: ['✅', 'Nada por devolver'], devuelto: ['📦', 'No hay productos esperando respuesta'], resuelto: ['🗂️', 'Aún no hay resueltos'] }[est.tab];

  return [
    buscador,
    c.plata ? el('p', { class: 'gr-plata', text: `💸 ${pesos(c.plata)} en productos por recuperar (${c.porDevolver + c.devueltos})` }) : null,
    el('div', { class: 'segmentos segmentos-3', role: 'tablist' },
      pestana('pendiente', 'Por devolver'), pestana('devuelto', 'Devueltos'), pestana('resuelto', 'Resueltos')),
    visibles.length ? porLocal(ctx, visibles) : el('div', { class: 'vacio-estado' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: q ? '🔍' : vacio[0] }),
      el('h2', { class: 'vacio-titulo', text: q ? 'Sin resultados' : vacio[1] }),
      est.tab === 'pendiente' && !q ? el('p', { class: 'vacio-texto', text: 'Si un producto sale malo al probarlo, toca "＋ Producto para devolver".' }) : null),
    est.tab === 'resuelto' && visibles.length ? el('p', { class: 'st-candado', text: '🔒 Los resueltos quedan guardados para siempre.' }) : null,
  ];
}

/** En "Por devolver" se agrupa por local: así se ve qué llevarle a cada proveedor. */
function porLocal(ctx, lista) {
  if (est.tab !== 'pendiente') return el('ul', { class: 'tarjetas' }, ...lista.map((d) => tarjeta(ctx, d)));
  const locales = [...new Set(lista.map((d) => d.proveedor || 'Sin local'))];
  return el('div', {}, ...locales.flatMap((loc) => {
    const delLocal = lista.filter((d) => (d.proveedor || 'Sin local') === loc);
    return [
      el('h3', { class: 'grupo-titulo', text: `${loc} · ${pesos(delLocal.reduce((s, d) => s + total(d), 0))}` }),
      el('ul', { class: 'tarjetas' }, ...delLocal.map((d) => tarjeta(ctx, d))),
    ];
  }));
}

function tarjeta(ctx, d) {
  const etiqueta = d.estado === 'resuelto'
    ? el('span', { class: `etiqueta ${d.resultado === 'rechazado' ? 'etiqueta-no-hay' : 'etiqueta-comprado'}`, text: RESULTADOS[d.resultado] })
    : d.estado === 'devuelto' ? el('span', { class: 'etiqueta gr-enviada', text: `Devuelto ${hace(d.devuelto_en)}` })
      : el('span', { class: 'etiqueta gr-en-tienda', text: 'En la tienda' });
  return el('li', { class: 'tarjeta st-tarjeta', onclick: () => abrirFicha(ctx, d.id) },
    el('div', { class: 'tarjeta-info' },
      el('div', { class: 'st-fila' }, el('h4', { class: 'tarjeta-modelo', text: `${icono(d.tipo)} ${d.producto}${d.cantidad > 1 ? ` ×${d.cantidad}` : ''}` }), etiqueta),
      el('p', { class: 'tarjeta-detalle', text: [d.proveedor && `🏪 ${d.proveedor}`, d.fecha_compra && `comprado el ${soloFecha.format(deISO(d.fecha_compra))}`].filter(Boolean).join(' · ') }),
      d.falla ? el('p', { class: 'st-problema', text: `⚠️ ${d.falla}` }) : null,
      el('div', { class: 'st-fila st-pie' },
        el('span', { text: `Registrado ${hace(d.creado_en)} · ${d.creado_por}` }),
        el('strong', { class: d.estado === 'resuelto' ? '' : 'st-debe-txt', text: pesos(total(d)) }))));
}

// ── Ficha ────────────────────────────────────────────────────

async function abrirFicha(ctx, id) {
  est.vista = 'ficha';
  est.id = id;
  try { est.detalle = await datos.detalleDevolucion(id); } catch (error) {
    console.error(error);
    toast('No se pudo abrir.');
    irALista();
  }
  ctx.render();
  window.scrollTo({ top: 0 });
}

export function vistaFichaProductos(ctx) {
  const { devolucion: d, eventos, fotos } = est.detalle;
  const resuelto = d.estado === 'resuelto';
  const vivas = fotos.filter((f) => !f.borrada_en);
  const estadoTexto = { pendiente: '🏪 En la tienda, por devolver', devuelto: '📦 Devuelto al proveedor', resuelto: '🔒 Resuelto' }[d.estado];
  const lista = (pares) => el('dl', { class: 'st-datos' }, ...pares.filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  return [
    ctx.encabezado(`${icono(d.tipo)} ${d.producto}`, `Devolución #${d.numero} · ${estadoTexto}`, () => { irALista(); ctx.render(); }),
    el('div', { class: 'st-cuerpo lista st-ficha' },
      seccion('📦 Producto', lista([
        ['Tipo', TIPOS_PRODUCTO[d.tipo]?.slice(3)], ['Producto', d.producto], ['Cantidad', String(d.cantidad)],
        ['Costo', `${pesos(d.costo)}${d.cantidad > 1 ? ` c/u · total ${pesos(total(d))}` : ''}`],
        ['Qué falla', d.falla],
      ])),
      seccion('🏪 Compra', lista([
        ['Local', d.proveedor || 'Sin dato'], ['Fecha', d.fecha_compra ? soloFecha.format(deISO(d.fecha_compra)) : 'Sin dato'], ['Factura', d.factura],
        ['Registró', `${d.creado_por} · ${fechaCorta.format(new Date(d.creado_en))}`],
        ['Devuelto', d.devuelto_en && `${fechaCorta.format(new Date(d.devuelto_en))}${d.devuelto_nota ? ` · ${d.devuelto_nota}` : ''}`],
        ['Resultado', d.resultado && `${RESULTADOS[d.resultado]}${d.respuesta ? ` · ${d.respuesta}` : ''}`],
      ])),
      seccion(`📷 Fotos (${vivas.length})`,
        vivas.length ? el('div', { class: 'st-fotos' }, ...vivas.map((f) => el('figure', { class: 'st-foto' },
          f.url ? el('img', { src: f.url, alt: f.etiqueta || 'Foto', loading: 'lazy', onclick: () => window.open(f.url, '_blank', 'noopener') })
            : el('div', { class: 'st-foto-vacia', text: '📷' }),
          el('figcaption', { text: f.etiqueta || 'Foto' })))) : el('p', { class: 'st-nota', text: 'Sin fotos todavía.' }),
        !resuelto ? el('div', { class: 'st-botones' }, ctx.botonFoto((archivo) => agregarFoto(ctx, d, archivo))) : null),
      seccion('🧾 Historial', el('ol', { class: 'st-historial' }, ...eventos.map((e) => el('li', { class: 'st-evento',
        style: `--c:${{ devuelto: 'var(--marca-celeste)', resuelto: 'var(--exito)', nota: 'var(--aviso-texto)' }[e.tipo] ?? 'var(--marca-brillante)'}` },
        el('small', { text: `${fechaCorta.format(new Date(e.creado_en))} · ${e.autor}` }), el('span', { text: e.texto })))),
        el('div', { class: 'st-botones' },
          el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => agregarNota(ctx, d) }, '📝 Agregar nota'),
          !resuelto ? el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => abrirFormulario(ctx, d) }, '✏️ Editar datos') : null)),
      ...(d.estado === 'pendiente' ? [
        el('button', { type: 'button', class: 'grande btn-principal st-grande', onclick: () => devolver(ctx, d) }, '📦 Ya se devolvió al proveedor'),
        el('button', { type: 'button', class: 'btn btn-secundario st-ancho', onclick: () => resolver(ctx, d) }, '✅ Se resolvió de una vez (cambio o dinero)'),
      ] : d.estado === 'devuelto' ? [
        el('button', { type: 'button', class: 'grande btn-exito st-grande', onclick: () => resolver(ctx, d) }, '✅ Registrar cómo se resolvió'),
      ] : [el('p', { class: 'st-candado', text: '🔒 Resuelto: queda guardado para siempre (solo se pueden agregar notas).' })])),
  ];
}

// ── Acciones ─────────────────────────────────────────────────

async function agregarFoto(ctx, d, archivo) {
  let blob;
  try { blob = await ctx.aBlob(archivo); } catch { toast('No se pudo leer la foto.'); return; }
  const r = await abrirHoja('📷 Nueva foto', (cerrar) => {
    const etiqueta = campoTexto('¿Qué muestra?', { placeholder: 'Ej: No enciende / cable pelado' });
    return [el('img', { class: 'st-vista-previa', src: URL.createObjectURL(blob), alt: '' }), etiqueta.nodo,
      botonesHoja(cerrar, 'Guardar foto', () => cerrar({ etiqueta: etiqueta.entrada.value.trim() }))];
  });
  if (r) await ctx.trabajar(datos.subirFotoDevolucion(d.id, blob, r.etiqueta), '📷 Foto guardada');
}

async function agregarNota(ctx, d) {
  const texto = await abrirHoja('📝 Agregar nota', (cerrar) => {
    const t = campoTexto('Nota (queda en el historial)', { multilinea: true, placeholder: 'Ej: El proveedor dice que lo cambia la otra semana' });
    return [t.nodo, botonesHoja(cerrar, 'Guardar', () => cerrar(t.entrada.value.trim()))];
  });
  if (texto) await ctx.trabajar(datos.notaDevolucion(d.id, texto), '📝 Nota guardada');
}

async function devolver(ctx, d) {
  const r = await abrirHoja('📦 Devuelto al proveedor', (cerrar) => {
    const nota = campoTexto('Nota (opcional)', { placeholder: 'Ej: Lo recibió Juan, quedó de cambiarlo el lunes' });
    return [el('p', { class: 'st-nota', text: `${d.producto}${d.cantidad > 1 ? ` ×${d.cantidad}` : ''} → ${d.proveedor || 'proveedor'}` }), nota.nodo,
      botonesHoja(cerrar, 'Marcar como devuelto', () => cerrar({ nota: nota.entrada.value.trim() }))];
  });
  if (r) await ctx.trabajar(datos.marcarDevuelto(d.id, r.nota), '📦 Marcado como devuelto');
}

async function resolver(ctx, d) {
  const r = await abrirHoja('✅ ¿Cómo se resolvió?', (cerrar) => {
    let resultado = '';
    const detalle = campoTexto('Detalle (opcional)', { placeholder: 'Ej: Trajeron 3 cables nuevos / nota crédito de $18.000' });
    return [selectorUnico(Object.entries(RESULTADOS), resultado, (v) => { resultado = v; }), detalle.nodo,
      botonesHoja(cerrar, 'Guardar', () => {
        if (!resultado) { toast('Elige cómo se resolvió'); return; }
        cerrar({ resultado, detalle: detalle.entrada.value.trim() });
      }, 'btn-exito')];
  });
  if (!r) return;
  const n = await ctx.trabajar(datos.resolverDevolucion(d.id, r.resultado, r.detalle), '✅ Resuelto');
  if (n) { est.tab = 'resuelto'; irALista(); ctx.render(); }
}

/** Formulario para registrar (d = null) o editar un producto. */
export function abrirFormulario(ctx, d = null) {
  const f = {
    tipo: d?.tipo ?? 'celular', producto: d?.producto ?? '', cantidad: d?.cantidad ?? 1, costo: d?.costo || '', proveedor: d?.proveedor ?? '',
    fecha_compra: d?.fecha_compra ?? '', factura: d?.factura ?? '', falla: d?.falla ?? '',
  };
  const fotos = [];
  const entradas = {};
  const campo = (clave, etiqueta, props = {}) => {
    const c = campoTexto(etiqueta, { value: f[clave], ...props, oninput: (e) => { f[clave] = e.target.value; pintarTotal(); } });
    entradas[clave] = c.entrada;
    return c.nodo;
  };
  const totalNodo = el('p', { class: 'gr-plata' });
  const pintarTotal = () => {
    const t = (Number(f.costo) || 0) * Math.max(1, Number(f.cantidad) || 1);
    totalNodo.textContent = t ? `Total: ${pesos(t)}` : '';
  };
  // Locales usados antes, para no escribirlos cada vez
  const locales = [...new Set(ctx.devoluciones().map((x) => x.proveedor).filter(Boolean))].slice(0, 12);
  const sugerencias = el('datalist', { id: 'locales-devolucion' }, ...locales.map((l) => el('option', { value: l })));

  const fotosCaja = el('div', { class: 'st-fotos' });
  const pintarFotos = () => fotosCaja.replaceChildren(...fotos.map((b) => el('figure', { class: 'st-foto' }, el('img', { src: URL.createObjectURL(b), alt: '' }))));

  const guardar = el('button', { type: 'button', class: 'grande btn-principal st-grande', onclick: async () => {
    if (!f.producto.trim()) { toast('Escribe qué producto es'); entradas.producto.focus(); return; }
    if (!f.falla.trim()) { toast('Escribe qué falla tiene'); entradas.falla.focus(); return; }
    guardar.disabled = true; guardar.textContent = 'Guardando…';
    const cambios = { ...f, cantidad: Math.max(1, Number(f.cantidad) || 1), costo: Number(f.costo) || 0 };
    try {
      const n = d ? await datos.actualizarDevolucion(d.id, cambios) : await datos.crearDevolucion(cambios);
      for (const b of fotos) await datos.subirFotoDevolucion(n.id, b, 'Cómo está').catch((e) => console.error(e));
      toast(d ? '✏️ Datos actualizados' : '📦 Producto registrado para devolver');
      await ctx.recargar();
      await abrirFicha(ctx, n.id);
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar.', 5000);
      guardar.disabled = false; guardar.textContent = 'Guardar';
    }
  } }, 'Guardar');

  est.vista = 'formulario';
  ctx.contenedor().replaceChildren(
    ctx.encabezado(d ? '✏️ Editar producto' : '＋ Producto para devolver', 'Producto del local que no funciona',
      () => { if (d) abrirFicha(ctx, d.id); else { irALista(); ctx.render(); } }),
    el('div', { class: 'st-cuerpo lista st-form' },
      el('span', { class: 'st-etiqueta', text: '¿Qué es?' }),
      selectorUnico(Object.entries(TIPOS_PRODUCTO), f.tipo, (v) => { f.tipo = v; }),
      campo('producto', 'Producto (marca y modelo) *', { placeholder: 'Ej: Cable USB-C 1 m Samsung', autocomplete: 'off' }),
      el('div', { class: 'dos' },
        campo('costo', 'Cuánto costó (c/u)', { dinero: true }),
        campo('cantidad', 'Cantidad', { type: 'number', inputmode: 'numeric', min: 1 })),
      totalNodo,
      campo('proveedor', 'Local donde se compró', { placeholder: 'Ej: Mayorista El Centro', list: 'locales-devolucion', autocomplete: 'off' }), sugerencias,
      el('div', { class: 'dos' },
        campo('fecha_compra', 'Cuándo se compró', { type: 'date', max: aISO(new Date()) }),
        campo('factura', 'Factura (opcional)')),
      campo('falla', '¿Qué falla tiene? *', { multilinea: true, placeholder: 'Ej: No carga / no prende / no sirve el botón' }),
      !d ? el('span', { class: 'st-etiqueta', text: '📷 Fotos (opcional)' }) : null, !d ? fotosCaja : null,
      !d ? ctx.botonFoto(async (archivo) => {
        try { fotos.push(await ctx.aBlob(archivo)); pintarFotos(); } catch { toast('No se pudo leer la foto.'); }
      }, '📷 Tomar foto') : null,
      guardar),
  );
  pintarTotal();
  window.scrollTo({ top: 0 });
}
