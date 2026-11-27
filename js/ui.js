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
function tarjetaLista(item, { onLlego }) {
  const nodo = el('li', { class: claseTarjeta(item, item.estado === 'comprado' ? 'es-comprado' : ''), 'data-id': item.id },
    infoTarjeta(item),
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

/** Una sección por categoría (vista "Todo" y Modo compras). */
function seccionesPorCategoria(items, crearTarjeta, nivel = 'h2') {
  return CATEGORIAS
    .map((cat) => ({ cat, delCat: items.filter((it) => categoriaPorId(it.categoria).id === cat.id) }))
    .filter(({ delCat }) => delCat.length)
    .map(({ cat, delCat }) => el('section', { class: 'seccion' },
      el(nivel, { class: 'seccion-titulo' }, cat.nombre, el('span', { class: 'contador', text: String(delCat.length) })),
      ...gruposPorSubtipo(cat, delCat, crearTarjeta),
    ));
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

export function dibujarLista(contenedor, items, activa, { onLlego, onCompras, instalar }) {
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

  const crear = (it) => tarjetaLista(it, { onLlego });
  if (activa !== 'todo') {
    contenedor.replaceChildren(...gruposPorSubtipo(categoriaPorId(activa), visibles, crear));
    return;
  }
  contenedor.replaceChildren(...[aviso, botonCompras, ...seccionesPorCategoria(visibles, crear)].filter(Boolean));
}

// ── Modo compras ─────────────────────────────────────────────

/**
 * Clasifica los productos para el Modo compras.
 * "inicio" = cuándo empezó esta salida de compras: un "no se consiguió"
 * de una salida ANTERIOR vuelve a "Por comprar" (con su nota).
 */
export function agruparCompras(items, inicio) {
  const deHoy = (it) => it.estado_en && new Date(it.estado_en).getTime() >= inicio;
  return {
    porComprar: items.filter((it) => it.estado === 'pendiente' || (it.estado === 'no_conseguido' && !deHoy(it))),
    enCarrito: items.filter((it) => it.estado === 'comprado'),
    noHayHoy: items.filter((it) => it.estado === 'no_conseguido' && deHoy(it)),
  };
}

function tarjetaCompra(item, { onComprado, onNoHay }) {
  const nodo = el('li', { class: claseTarjeta(item, 'tarjeta-compra'), 'data-id': item.id },
    infoTarjeta(item),
    el('div', { class: 'botones-compra' },
      el('button', {
        type: 'button', class: 'btn-comprado',
        'aria-label': `${tituloDe(item)}: comprado`,
        onclick: () => onComprado(item, nodo),
      }, '✓ Comprado'),
      el('button', {
        type: 'button', class: 'btn-no-hay',
        'aria-label': `${tituloDe(item)}: no se consiguió`,
        onclick: () => onNoHay(item, nodo),
      }, '✗ No hay'),
    ),
  );
  return nodo;
}

function tarjetaResuelta(item, { onDeshacer }) {
  return el('li', { class: claseTarjeta(item, 'tarjeta-resuelta'), 'data-id': item.id },
    infoTarjeta(item, { mostrarEstado: false }),
    el('button', {
      type: 'button', class: 'btn-deshacer',
      'aria-label': `Deshacer ${tituloDe(item)}`,
      onclick: () => onDeshacer(item),
    }, 'Deshacer'),
  );
}

export function dibujarCompras(contenedor, items, inicio, acciones) {
  marcarPrimerDibujo(items);
  const { porComprar, enCarrito, noHayHoy } = agruparCompras(items, inicio);
  const nodos = [];

  if (porComprar.length) {
    nodos.push(...seccionesPorCategoria(porComprar, (it) => tarjetaCompra(it, acciones)));
  } else {
    nodos.push(el('div', { class: 'vacio-estado vacio-compras' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: items.length ? '✅' : '🎉' }),
      el('h2', { class: 'vacio-titulo', text: items.length ? '¡Revisaste todo!' : 'No hay nada por comprar' }),
      el('p', { class: 'vacio-texto', text: items.length ? 'Toca "Terminar" arriba para cerrar la compra.' : 'La lista de faltantes está vacía.' }),
    ));
  }

  const resumen = (titulo, clase, lista) => lista.length && el('section', { class: `seccion seccion-resuelta ${clase}` },
    el('h2', { class: 'seccion-titulo' }, titulo, el('span', { class: 'contador', text: String(lista.length) })),
    el('ul', { class: 'tarjetas' }, ...lista.map((it) => tarjetaResuelta(it, acciones))),
  );
  nodos.push(resumen('🛒 En el carrito', 'resuelta-carrito', enCarrito));
  nodos.push(resumen('✗ No se consiguió hoy', 'resuelta-no-hay', noHayHoy));
  contenedor.replaceChildren(...nodos.filter(Boolean));
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
