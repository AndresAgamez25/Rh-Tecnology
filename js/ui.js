// ─────────────────────────────────────────────────────────────
// INTERFAZ: dibuja pestañas, tarjetas, estado vacío, modal y toasts.
// REGLA DE SEGURIDAD: nunca usamos innerHTML con datos. Todo texto
// que viene de la base de datos o de la IA entra con textContent.
// ─────────────────────────────────────────────────────────────
import { CATEGORIAS, categoriaPorId, nombreSubtipo } from './categorias.js';

/**
 * Crea un elemento de forma segura.
 * el('p', { class: 'x', text: 'hola' }, hijo1, hijo2)
 * Los hijos que son texto se agregan como nodos de texto (seguros).
 */
export function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'text') nodo.textContent = valor;
    else if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  nodo.append(...hijos.filter((h) => h != null && h !== false));
  return nodo;
}

const PESTANAS = [{ id: 'todo', nombre: 'Todo' }, ...CATEGORIAS];

// ── Pestañas ─────────────────────────────────────────────────

/** Crea las pestañas una sola vez (así no se pierde el scroll horizontal). */
export function crearPestanas(contenedor, onCambio) {
  contenedor.replaceChildren(...PESTANAS.map((p) =>
    el('button', {
      type: 'button', role: 'tab', class: 'pestana', 'data-id': p.id,
      'aria-selected': 'false',
      onclick: () => onCambio(p.id),
    }, p.nombre, el('span', { class: 'contador', text: '0' })),
  ));

  // Flechas izquierda/derecha para moverse con teclado
  contenedor.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const botones = [...contenedor.children];
    const i = botones.indexOf(document.activeElement);
    const sig = botones[(i + (e.key === 'ArrowRight' ? 1 : -1) + botones.length) % botones.length];
    sig.focus();
    sig.click();
  });
}

export function actualizarPestanas(contenedor, items, activa) {
  for (const boton of contenedor.children) {
    const id = boton.dataset.id;
    const n = id === 'todo' ? items.length : items.filter((it) => it.categoria === id).length;
    const contador = boton.querySelector('.contador');
    // Si el número cambió (alguien agregó o quitó algo), el contador "salta"
    if (contador.dataset.listo && contador.textContent !== String(n)) {
      contador.classList.remove('pop');
      void contador.offsetWidth; // reinicia la animación
      contador.classList.add('pop');
    }
    contador.dataset.listo = '1';
    contador.textContent = String(n);
    contador.classList.toggle('vacio', n === 0);
    const seleccionada = id === activa;
    boton.setAttribute('aria-selected', String(seleccionada));
    boton.tabIndex = seleccionada ? 0 : -1;
    if (seleccionada) boton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// ── Fechas ───────────────────────────────────────────────────

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function formatearFecha(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const min = Math.round((Date.now() - fecha.getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return relativo.format(-min, 'minute');
  if (min < 60 * 24) return relativo.format(-Math.round(min / 60), 'hour');
  return fechaCorta.format(fecha);
}

// ── Lista ────────────────────────────────────────────────────

// Recordamos qué tarjetas ya se mostraron para animar SOLO las nuevas
// (si no, cada redibujado haría "parpadear" toda la lista).
const yaMostradas = new Set();
let primerDibujo = true;

/** ¿La tarjeta es nueva? (para animar solo las que acaban de llegar) */
function claseTarjeta(item, extra = '') {
  const esNueva = !primerDibujo && !yaMostradas.has(item.id);
  yaMostradas.add(item.id);
  return ['tarjeta', esNueva && 'nueva', extra].filter(Boolean).join(' ');
}

function tituloDe(item) {
  return item.modelo || item.detalle || categoriaPorId(item.categoria).nombre;
}

/** Parte de la tarjeta con modelo, detalle, "Quedan" y estado. */
function infoTarjeta(item, { mostrarEstado = true } = {}) {
  const detalle = item.modelo ? item.detalle : '';
  const meta = [formatearFecha(item.creado_en), item.creado_por].filter(Boolean).join(' · ');
  return el('div', { class: 'tarjeta-info' },
    el('h4', { class: 'tarjeta-modelo', text: tituloDe(item) }),
    detalle ? el('p', { class: 'tarjeta-detalle', text: detalle }) : null,
    item.quedan ? el('span', { class: 'etiqueta etiqueta-quedan', text: `Quedan: ${item.quedan}` }) : null,
    mostrarEstado ? etiquetaEstado(item) : null,
    meta ? el('p', { class: 'tarjeta-meta', text: meta }) : null,
  );
}

/** Etiqueta "🛒 Comprado por…" o "No se consiguió…" */
function etiquetaEstado(item) {
  const quien = [item.estado_por, item.estado_en && formatearFecha(item.estado_en)].filter(Boolean).join(' · ');
  if (item.estado === 'comprado') {
    return el('span', { class: 'etiqueta etiqueta-comprado', text: `🛒 Comprado${quien ? ` · ${quien}` : ''}` });
  }
  if (item.estado === 'no_conseguido') {
    return el('span', { class: 'etiqueta etiqueta-no-hay', text: `✗ No se consiguió${quien ? ` · ${quien}` : ''}` });
  }
  return null;
}

/** Tarjeta de la lista normal, con "✓ Llegó". */
function tarjetaLista(item, { onLlego, onEditar }) {
  const nodo = el('li', { class: claseTarjeta(item, item.estado === 'comprado' ? 'es-comprado' : ''), 'data-id': item.id },
    infoTarjeta(item),
    onEditar ? el('button', {
      type: 'button', class: 'btn-editar',
      'aria-label': `Corregir ${tituloDe(item)}`, title: 'Corregir',
      onclick: () => onEditar(item),
    }, '✏️') : null,
    el('button', {
      type: 'button', class: 'btn-llego',
      'aria-label': `Marcar ${tituloDe(item)} como llegado`,
      onclick: () => onLlego(item, nodo),
    }, '✓ Llegó'),
  );
  return nodo;
}

/** Agrupa los ítems de una categoría por subtipo, en el orden definido. */
function gruposPorSubtipo(categoria, items, crearTarjeta) {
  const orden = [...categoria.subtipos.map((s) => s.id), null];
  const nodos = [];
  for (const sub of orden) {
    const delGrupo = items
      .filter((it) => (it.subtipo ?? null) === sub || (sub === null && !nombreSubtipo(categoria.id, it.subtipo)))
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
    if (!delGrupo.length) continue;

    // Si la categoría tiene subtipos, mostramos título; los "sin subtipo" van en "General"
    if (categoria.subtipos.length) {
      nodos.push(el('h3', { class: 'grupo-titulo', text: nombreSubtipo(categoria.id, sub) ?? 'General' }));
    }
    nodos.push(el('ul', { class: 'tarjetas' }, ...delGrupo.map(crearTarjeta)));
  }
  return nodos;
}

/**
 * Una sección por categoría (vista "Todo" y Modo compras).
 * agrupar=false: sin títulos de subtipo (más compacto); se ordena por subtipo.
 */
function seccionesPorCategoria(items, crearTarjeta, { agrupar = true } = {}) {
  return CATEGORIAS
    .map((cat) => ({ cat, delCat: items.filter((it) => categoriaPorId(it.categoria).id === cat.id) }))
    .filter(({ delCat }) => delCat.length)
    .map(({ cat, delCat }) => {
      const orden = cat.subtipos.map((s) => s.id);
      const posicion = (it) => (orden.includes(it.subtipo) ? orden.indexOf(it.subtipo) : orden.length);
      return el('section', { class: 'seccion' },
        el('h2', { class: 'seccion-titulo' }, cat.nombre, el('span', { class: 'contador', text: String(delCat.length) })),
        ...(agrupar
          ? gruposPorSubtipo(cat, delCat, crearTarjeta)
          : [el('ul', { class: 'tarjetas' }, ...[...delCat].sort((a, b) => posicion(a) - posicion(b)).map(crearTarjeta))]),
      );
    });
}

function estadoVacio(activa) {
  const nombre = activa === 'todo' ? null : categoriaPorId(activa).nombre;
  return el('div', { class: 'vacio-estado' },
    el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🎉' }),
    el('h2', { class: 'vacio-titulo', text: nombre ? `${nombre}: todo surtido` : '¡No falta nada!' }),
    el('p', { class: 'vacio-texto', text: 'Cuando algo se acabe, escríbelo, dilo en un audio o tómale una foto abajo.' }),
  );
}

function marcarPrimerDibujo(items) {
  // En el primer dibujo nada se anima (todas cuentan como "ya vistas")
  if (primerDibujo) items.forEach((it) => yaMostradas.add(it.id));
  primerDibujo = false;
}

/** Aviso para instalar la app (solo si aún no está instalada). */
function avisoInstalar({ onInstalar, onCerrar }) {
  return el('div', { class: 'aviso-instalar' },
    el('button', { type: 'button', class: 'aviso-instalar-boton', onclick: onInstalar },
      el('span', { class: 'aviso-instalar-icono', 'aria-hidden': 'true', text: '📲' }),
      el('span', { class: 'btn-ir-compras-texto' },
        el('strong', { text: 'Instalar la app' }),
        el('small', { text: 'Ábrela desde tu pantalla de inicio, sin buscar la página' }),
      ),
    ),
    el('button', { type: 'button', class: 'aviso-instalar-cerrar', 'aria-label': 'No mostrar más', onclick: onCerrar }, '✕'),
  );
}

export function dibujarLista(contenedor, items, activa, { onLlego, onEditar, onCompras, instalar }) {
  marcarPrimerDibujo(items);
  const visibles = activa === 'todo' ? items : items.filter((it) => it.categoria === activa);
  const aviso = activa === 'todo' && instalar ? avisoInstalar(instalar) : null;
  if (!visibles.length) {
    contenedor.replaceChildren(...[aviso, estadoVacio(activa)].filter(Boolean));
    return;
  }

  const porComprar = items.filter((it) => it.estado !== 'comprado').length;
  const botonCompras = activa === 'todo' && porComprar
    ? el('button', { type: 'button', class: 'btn-ir-compras', onclick: onCompras },
        el('span', { class: 'btn-ir-compras-icono', 'aria-hidden': 'true', text: '🛒' }),
        el('span', { class: 'btn-ir-compras-texto' },
          el('strong', { text: 'Modo compras' }),
          el('small', { text: `${porComprar} ${porComprar === 1 ? 'producto' : 'productos'} por comprar` }),
        ),
        el('span', { 'aria-hidden': 'true', text: '›' }),
      )
    : null;

  const crear = (it) => tarjetaLista(it, { onLlego, onEditar });
  if (activa !== 'todo') {
    contenedor.replaceChildren(...gruposPorSubtipo(categoriaPorId(activa), visibles, crear));
    return;
  }
  contenedor.replaceChildren(...[aviso, botonCompras, ...seccionesPorCategoria(visibles, crear)].filter(Boolean));
}

// ── Modo compras ─────────────────────────────────────────────
// Al marcar un producto sale de la vista y sube el siguiente. Las marcas
// viven en un BORRADOR hasta "Terminar compra"; los ya marcados se ven
// (y se pueden deshacer) en "Ya revisados", al final.

/**
 * Estado GUARDADO de un producto para esta salida de compras.
 * "inicio" = cuándo empezó la salida: un "no hay" de una salida ANTERIOR
 * cuenta como pendiente (vuelve a buscarse), con su nota.
 */
export function estadoGuardado(item, inicio) {
  if (item.estado === 'comprado') return 'comprado';
  if (item.estado === 'no_conseguido' && item.estado_en && new Date(item.estado_en).getTime() >= inicio) {
    return 'no_conseguido';
  }
  return 'pendiente';
}

/** Cuenta comprados / no hay / pendientes, teniendo en cuenta el borrador. */
export function resumenCompras(items, inicio, borrador = {}) {
  const r = { comprado: 0, no_conseguido: 0, pendiente: 0 };
  for (const it of items) r[borrador[it.id] ?? estadoGuardado(it, inicio)] += 1;
  return r;
}

/** Subtipo para mostrar en pequeño (en celulares no: la marca ya va en el modelo). */
function subtipoCorto(item) {
  return item.categoria === 'celulares' ? null : nombreSubtipo(item.categoria, item.subtipo);
}

/** Texto corto "subtipo · detalle · quedan" para filas compactas. */
function lineaDetalle(item) {
  return [subtipoCorto(item), item.modelo ? item.detalle : '', item.quedan && `quedan ${item.quedan}`]
    .filter(Boolean).join(' · ');
}

function tarjetaCompra(item, onMarcar) {
  const titulo = tituloDe(item);
  // Sin títulos de grupo: la marca/tipo va dentro de la tarjeta, en pequeño
  const detalle = [subtipoCorto(item), item.modelo ? item.detalle : ''].filter(Boolean).join(' · ');
  const nodo = el('li', { class: claseTarjeta(item, 'tarjeta-compra'), 'data-id': item.id },
    el('div', { class: 'tarjeta-info' },
      el('h4', { class: 'tarjeta-modelo', text: titulo }),
      detalle ? el('p', { class: 'tarjeta-detalle', text: detalle }) : null,
      item.quedan ? el('span', { class: 'etiqueta etiqueta-quedan', text: `Quedan: ${item.quedan}` }) : null,
      item.estado === 'no_conseguido' ? el('span', { class: 'etiqueta etiqueta-no-hay', text: '✗ La vez pasada no había' }) : null,
    ),
    el('div', { class: 'botones-compra' },
      el('button', {
        type: 'button', class: 'btn-comprado',
        'aria-label': `${titulo}: comprado`,
        onclick: () => onMarcar(item, 'comprado', nodo),
      }, el('span', { 'aria-hidden': 'true', text: '✓' }), 'Comprado'),
      el('button', {
        type: 'button', class: 'btn-no-hay',
        'aria-label': `${titulo}: no hay`,
        onclick: () => onMarcar(item, 'no_conseguido', nodo),
      }, el('span', { 'aria-hidden': 'true', text: '✗' }), 'No hay'),
    ),
  );
  return nodo;
}

function filaRevisada(item, marca, onDeshacer) {
  const comprado = marca === 'comprado';
  return el('li', { class: `fila-revisada ${comprado ? 'es-comprado' : 'es-no-hay'}` },
    el('span', { class: 'fila-icono', 'aria-label': comprado ? 'Comprado' : 'No hay', text: comprado ? '✓' : '✗' }),
    el('span', { class: 'fila-texto' },
      el('strong', { text: tituloDe(item) }),
      lineaDetalle(item) ? el('small', { text: lineaDetalle(item) }) : null,
    ),
    el('button', { type: 'button', class: 'btn-deshacer', 'aria-label': `Deshacer ${tituloDe(item)}`, onclick: () => onDeshacer(item) }, 'Deshacer'),
  );
}

export function dibujarCompras(contenedor, items, inicio, { borrador, onMarcar, onDeshacer }) {
  marcarPrimerDibujo(items);
  if (!items.length) {
    contenedor.replaceChildren(el('div', { class: 'vacio-estado vacio-compras' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🎉' }),
      el('h2', { class: 'vacio-titulo', text: 'No hay nada por comprar' }),
      el('p', { class: 'vacio-texto', text: 'La lista de faltantes está vacía.' }),
    ));
    return;
  }
  const marca = (it) => borrador[it.id] ?? estadoGuardado(it, inicio);
  const pendientes = items.filter((it) => marca(it) === 'pendiente');
  // Ya revisados: primero lo comprado, luego lo que no había
  const revisados = items.filter((it) => marca(it) !== 'pendiente')
    .sort((a, b) => (marca(a) === 'comprado' ? 0 : 1) - (marca(b) === 'comprado' ? 0 : 1));

  const nodos = pendientes.length
    ? seccionesPorCategoria(pendientes, (it) => tarjetaCompra(it, onMarcar), { agrupar: false })
    : [el('div', { class: 'vacio-estado vacio-compras' },
        el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '✅' }),
        el('h2', { class: 'vacio-titulo', text: '¡Revisaste todo!' }),
        el('p', { class: 'vacio-texto', text: 'Toca "Terminar compra" abajo para guardar la factura.' }),
      )];

  if (revisados.length) {
    const comprados = revisados.filter((it) => marca(it) === 'comprado').length;
    nodos.push(el('details', { class: 'revisados', open: pendientes.length === 0 },
      el('summary', {},
        `Ya revisados (${revisados.length})`,
        el('span', { class: 'revisados-conteo', text: `✓ ${comprados} · ✗ ${revisados.length - comprados}` }),
      ),
      el('ul', { class: 'filas' }, ...revisados.map((it) => filaRevisada(it, marca(it), onDeshacer))),
    ));
  }
  contenedor.replaceChildren(...nodos);
}

// ── Facturas ─────────────────────────────────────────────────

const fechaLarga = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

function filaFactura(item) {
  const comprado = item.resultado === 'comprado';
  return el('li', { class: `fila-revisada ${comprado ? 'es-comprado' : 'es-no-hay'}` },
    el('span', { class: 'fila-icono', 'aria-label': comprado ? 'Se compró' : 'No se consiguió', text: comprado ? '✓' : '✗' }),
    el('span', { class: 'fila-texto' },
      el('strong', { text: tituloDe(item) }),
      lineaDetalle(item) ? el('small', { text: lineaDetalle(item) }) : null,
    ),
    el('span', { class: 'fila-resultado', text: comprado ? 'Comprado' : 'No había' }),
  );
}

/** Apartado de la factura ("Se compró" o "No se consiguió"), por categoría. */
function apartadoFactura(items, resultado) {
  const lista = items.filter((it) => it.resultado === resultado);
  if (!lista.length) return null;
  const comprado = resultado === 'comprado';
  return el('section', { class: `factura-apartado ${comprado ? 'apartado-comprado' : 'apartado-no-hay'}` },
    el('h3', { class: 'apartado-titulo' },
      comprado ? '✓ Se compró' : '✗ No se consiguió',
      el('span', { class: 'contador', text: String(lista.length) }),
      comprado ? null : el('small', { text: 'vuelve a la lista' }),
    ),
    ...CATEGORIAS
      .map((cat) => ({ cat, del: lista.filter((it) => categoriaPorId(it.categoria).id === cat.id) }))
      .filter(({ del }) => del.length)
      .map(({ cat, del }) => el('div', { class: 'factura-seccion' },
        el('h4', { class: 'grupo-titulo', text: cat.nombre }),
        el('ul', { class: 'filas' }, ...del.map(filaFactura)),
      )),
  );
}

function factura(f, abierta, onPDF, onBorrar) {
  const items = Array.isArray(f.items) ? f.items : [];
  const botonPDF = el('button', {
    type: 'button', class: 'btn btn-pdf',
    onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = 'Generando PDF…';
      try { await onPDF(f); } finally { b.disabled = false; b.textContent = '📄 Descargar PDF'; }
    },
  }, '📄 Descargar PDF');
  return el('details', { class: 'factura', open: abierta, 'data-id': f.id },
    el('summary', {},
      el('span', { class: 'factura-titulo' },
        el('strong', { text: fechaLarga.format(new Date(f.creada_en)) }),
        el('small', { text: `Compró: ${f.hecha_por}` }),
      ),
      el('span', { class: 'factura-totales' },
        el('span', { class: 'total-comprado', text: `✓ ${f.total_comprados}` }),
        el('span', { class: 'total-no-hay', text: `✗ ${f.total_no_conseguidos}` }),
      ),
    ),
    el('div', { class: 'factura-cuerpo' },
      apartadoFactura(items, 'comprado'),
      apartadoFactura(items, 'no_conseguido'),
      el('div', { class: 'factura-acciones' },
        el('button', { type: 'button', class: 'btn btn-borrar', onclick: () => onBorrar(f) }, '🗑️ Borrar'),
        botonPDF,
      ),
    ),
  );
}

// ── Historial de actividad ───────────────────────────────────

const hora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const dia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const ICONOS = { agregar: '＋', quitar: '−', vaciar: '⟲', compra: '🛒', borrar_factura: '🗑️', servicio: '🔧', editar: '✏️' };

function nombreDia(fecha) {
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  const igual = (a, b) => a.toDateString() === b.toDateString();
  if (igual(fecha, hoy)) return 'Hoy';
  if (igual(fecha, ayer)) return 'Ayer';
  const t = dia.format(fecha);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function dibujarActividad(actividad) {
  if (!actividad.length) {
    return [el('div', { class: 'vacio-estado' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🕓' }),
      el('h2', { class: 'vacio-titulo', text: 'Sin actividad todavía' }),
      el('p', { class: 'vacio-texto', text: 'Aquí aparece quién agregó, quitó, compró o borró algo.' }),
    )];
  }
  const nodos = [];
  let diaActual = '';
  let lista = null;
  for (const a of actividad) {
    const fecha = new Date(a.creado_en);
    const nombre = nombreDia(fecha);
    if (nombre !== diaActual) {
      diaActual = nombre;
      nodos.push(el('h3', { class: 'grupo-titulo actividad-dia', text: nombre }));
      lista = el('ul', { class: 'actividad' });
      nodos.push(lista);
    }
    // El nombre de la persona va en negrita (siempre con textContent: seguro)
    const quien = a.quien && a.texto.startsWith(a.quien) ? a.quien : '';
    lista.append(el('li', { class: `actividad-linea accion-${a.accion}` },
      el('span', { class: 'actividad-icono', 'aria-hidden': 'true', text: ICONOS[a.accion] ?? '•' }),
      el('p', { class: 'actividad-texto' },
        quien ? el('strong', { text: quien }) : null,
        quien ? a.texto.slice(quien.length) : a.texto,
      ),
      el('time', { class: 'actividad-hora', datetime: a.creado_en, text: hora.format(fecha) }),
    ));
  }
  return nodos;
}

/** Pantalla 🧾: pestañas Facturas | Historial. */
export function dibujarRegistro(contenedor, { panel, facturas, actividad, abierta, nueva, onPDF, onBorrar, onPanel }) {
  const boton = (id, texto, n) => el('button', {
    type: 'button', role: 'tab', class: 'segmento', 'aria-selected': String(panel === id),
    onclick: () => onPanel(id),
  }, texto, n != null ? el('span', { class: 'contador', text: String(n) }) : null);

  const selector = el('div', { class: 'segmentos', role: 'tablist', 'aria-label': 'Facturas o historial' },
    boton('facturas', '🧾 Facturas', facturas?.length),
    boton('actividad', '🕓 Historial', null),
  );

  let cuerpo;
  const datos = panel === 'facturas' ? facturas : actividad;
  if (datos === null) {
    cuerpo = [el('p', { class: 'cargando-texto', text: 'Cargando…' })];
  } else if (panel === 'actividad') {
    cuerpo = dibujarActividad(actividad);
  } else if (!facturas.length) {
    cuerpo = [el('div', { class: 'vacio-estado' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🧾' }),
      el('h2', { class: 'vacio-titulo', text: 'Aún no hay facturas' }),
      el('p', { class: 'vacio-texto', text: 'Se crean solas al tocar "Terminar compra" en el Modo compras.' }),
    )];
  } else {
    cuerpo = facturas.map((f) => factura(f, f.id === abierta, onPDF, onBorrar));
    // Factura recién creada: animación de "guardado"
    const n = nueva && cuerpo.find((d) => d.dataset.id === nueva);
    if (n) {
      n.classList.add('factura-nueva');
      n.prepend(el('div', { class: 'sello-guardado', 'aria-hidden': 'true' }, el('span', { text: '✓' }), 'Factura guardada'));
    }
  }
  contenedor.replaceChildren(selector, ...cuerpo);
}

// ── Modal de confirmación ────────────────────────────────────

/**
 * Muestra el modal propio y devuelve una Promesa con true/false.
 * Usa <dialog>: el navegador se encarga del foco y de cerrar con Escape.
 */
export function confirmar({ titulo, mensaje, textoAceptar = 'Aceptar', peligro = true, soloAceptar = false }) {
  const modal = document.getElementById('modal');
  modal.querySelector('button[value="cancelar"]').hidden = soloAceptar;
  modal.querySelector('#modal-titulo').textContent = titulo;
  modal.querySelector('#modal-mensaje').textContent = mensaje;
  const aceptar = modal.querySelector('#modal-aceptar');
  aceptar.textContent = textoAceptar;
  aceptar.className = `btn ${peligro ? 'btn-peligro' : 'btn-principal'}`;
  modal.returnValue = '';

  return new Promise((resolver) => {
    modal.addEventListener('close', () => resolver(modal.returnValue === 'aceptar'), { once: true });
    modal.showModal();
  });
}

// Tocar fuera de la caja también cancela
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close('cancelar');
});

// ── Toast ────────────────────────────────────────────────────

let temporizador;
export function toast(mensaje, ms = 3200) {
  const nodo = document.getElementById('toast');
  nodo.textContent = mensaje;
  nodo.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => nodo.classList.remove('visible'), ms);
}
