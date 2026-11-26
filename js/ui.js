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

function tarjeta(item, onLlego) {
  const categoria = categoriaPorId(item.categoria);
  const titulo = item.modelo || item.detalle || categoria.nombre;
  const detalle = item.modelo ? item.detalle : '';
  const meta = [formatearFecha(item.creado_en), item.creado_por].filter(Boolean).join(' · ');

  const esNueva = !primerDibujo && !yaMostradas.has(item.id);
  yaMostradas.add(item.id);
  const nodo = el('li', { class: esNueva ? 'tarjeta nueva' : 'tarjeta', 'data-id': item.id },
    el('div', { class: 'tarjeta-info' },
      el('h4', { class: 'tarjeta-modelo', text: titulo }),
      detalle ? el('p', { class: 'tarjeta-detalle', text: detalle }) : null,
      item.quedan ? el('span', { class: 'etiqueta-quedan', text: `Quedan: ${item.quedan}` }) : null,
      meta ? el('p', { class: 'tarjeta-meta', text: meta }) : null,
    ),
    el('button', {
      type: 'button', class: 'btn-llego',
      'aria-label': `Marcar ${titulo} como llegado`,
      onclick: () => onLlego(item, nodo),
    }, '✓ Llegó'),
  );
  return nodo;
}

/** Agrupa los ítems de una categoría por subtipo, en el orden definido. */
function gruposPorSubtipo(categoria, items, onLlego) {
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
    nodos.push(el('ul', { class: 'tarjetas' }, ...delGrupo.map((it) => tarjeta(it, onLlego))));
  }
  return nodos;
}

function estadoVacio(activa) {
  const nombre = activa === 'todo' ? null : categoriaPorId(activa).nombre;
  return el('div', { class: 'vacio-estado' },
    el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🎉' }),
    el('h2', { class: 'vacio-titulo', text: nombre ? `${nombre}: todo surtido` : '¡No falta nada!' }),
    el('p', { class: 'vacio-texto', text: 'Cuando algo se acabe, escríbelo, dilo en un audio o tómale una foto abajo.' }),
  );
}

export function dibujarLista(contenedor, items, activa, { onLlego }) {
  const visibles = activa === 'todo' ? items : items.filter((it) => it.categoria === activa);
  // Las de otras pestañas también cuentan como "ya vistas"
  if (primerDibujo) items.forEach((it) => yaMostradas.add(it.id));
  primerDibujo = false;
  if (!visibles.length) {
    contenedor.replaceChildren(estadoVacio(activa));
    return;
  }

  if (activa !== 'todo') {
    contenedor.replaceChildren(...gruposPorSubtipo(categoriaPorId(activa), visibles, onLlego));
    return;
  }

  // Vista "Todo": una sección por categoría
  const secciones = CATEGORIAS
    .map((cat) => ({ cat, delCat: visibles.filter((it) => categoriaPorId(it.categoria).id === cat.id) }))
    .filter(({ delCat }) => delCat.length)
    .map(({ cat, delCat }) => el('section', { class: 'seccion' },
      el('h2', { class: 'seccion-titulo' }, cat.nombre, el('span', { class: 'contador', text: String(delCat.length) })),
      ...gruposPorSubtipo(cat, delCat, onLlego),
    ));
  contenedor.replaceChildren(...secciones);
}

// ── Modal de confirmación ────────────────────────────────────

/**
 * Muestra el modal propio y devuelve una Promesa con true/false.
 * Usa <dialog>: el navegador se encarga del foco y de cerrar con Escape.
 */
export function confirmar({ titulo, mensaje, textoAceptar = 'Aceptar' }) {
  const modal = document.getElementById('modal');
  modal.querySelector('#modal-titulo').textContent = titulo;
  modal.querySelector('#modal-mensaje').textContent = mensaje;
  modal.querySelector('#modal-aceptar').textContent = textoAceptar;
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
