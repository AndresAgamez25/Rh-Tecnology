// ─────────────────────────────────────────────────────────────
// TRABAJOS CON PRECIO
// Un equipo puede necesitar varios arreglos (pantalla, tapa, pin…),
// cada uno con su precio. Total = suma de los trabajos − descuento.
// crearEditorTrabajos() dibuja la lista editable; valor() devuelve
// { trabajos: [{descripcion, precio}], descuento, subtotal, total }.
// ─────────────────────────────────────────────────────────────
import { el } from '../ui.js';
import { pesos } from './whatsapp.js';
import { hacerDinero } from '../dinero.js';

// Atajos: tocar uno agrega una fila con ese nombre (luego se escribe el precio)
export const TRABAJOS_COMUNES = ['Pantalla', 'Tapa', 'Pin de carga', 'Batería', 'Cámara', 'Software', 'Revisión'];

export function sumaTrabajos(trabajos = []) {
  return trabajos.reduce((s, t) => s + (Number(t.precio) || 0), 0);
}

/** Trabajos válidos: con descripción y precio ≥ 0 (igual que la base de datos). */
export function limpiarTrabajos(trabajos = []) {
  return trabajos
    .map((t) => ({ descripcion: String(t.descripcion ?? '').trim().slice(0, 120), precio: Math.max(0, Math.round(Number(t.precio) || 0)) }))
    .filter((t) => t.descripcion)
    .slice(0, 30);
}

/** Para órdenes viejas sin trabajos: un solo renglón con el precio que tenían. */
export function trabajosDe(o) {
  if (Array.isArray(o.trabajos) && o.trabajos.length) return o.trabajos;
  return o.precio ? [{ descripcion: o.problema ? o.problema.slice(0, 120) : 'Arreglo', precio: o.precio }] : [];
}

/** Lista de solo lectura: "Pantalla ....... $180.000". */
export function tablaTrabajos(o) {
  const trabajos = trabajosDe(o);
  if (!trabajos.length) return null;
  const descuento = Number(o.descuento) || 0;
  return el('ul', { class: 'st-trabajos' },
    ...trabajos.map((t) => el('li', {}, el('span', { text: t.descripcion }), el('strong', { text: pesos(t.precio) }))),
    descuento ? el('li', { class: 'st-descuento' }, el('span', { text: 'Descuento' }), el('strong', { text: `− ${pesos(descuento)}` })) : null,
    el('li', { class: 'st-total' }, el('span', { text: 'Total' }), el('strong', { text: pesos(o.precio) })));
}

export function crearEditorTrabajos({ trabajos = [], descuento = 0, onCambio } = {}) {
  const filas = trabajos.map((t) => ({ descripcion: t.descripcion, precio: t.precio }));
  let desc = Number(descuento) || 0;

  const lista = el('div', { class: 'st-editor-filas' });
  const totalNodo = el('div', { class: 'st-editor-total' });
  const entradaDescuento = el('input', {
    class: 'st-input', placeholder: '0', 'aria-label': 'Descuento',
    oninput: (e) => { desc = Math.max(0, Number(e.target.value) || 0); pintarTotal(); },
  });
  hacerDinero(entradaDescuento);
  if (desc) entradaDescuento.value = String(desc);

  const valor = () => {
    const limpios = limpiarTrabajos(filas);
    const subtotal = sumaTrabajos(limpios);
    const d = Math.min(desc, subtotal);
    return { trabajos: limpios, descuento: d, subtotal, total: subtotal - d };
  };

  function pintarTotal() {
    const v = valor();
    totalNodo.replaceChildren(
      v.descuento ? el('span', { text: `Subtotal ${pesos(v.subtotal)} − descuento ${pesos(v.descuento)}` }) : el('span', { text: `${v.trabajos.length} ${v.trabajos.length === 1 ? 'trabajo' : 'trabajos'}` }),
      el('strong', { text: `Total ${pesos(v.total)}` }));
    onCambio?.(v);
  }

  function pintarFilas(enfocar = -1) {
    lista.replaceChildren(...filas.map((f, i) => {
      const nombre = el('input', { class: 'st-input', value: f.descripcion, placeholder: 'Ej: Pantalla', 'aria-label': `Trabajo ${i + 1}`,
        oninput: (e) => { f.descripcion = e.target.value; pintarTotal(); } });
      const precio = el('input', { class: 'st-input st-precio', placeholder: '$',
        'aria-label': `Precio del trabajo ${i + 1}`, oninput: (e) => { f.precio = e.target.value; pintarTotal(); } });
      hacerDinero(precio);
      if (f.precio !== '' && f.precio != null) precio.value = String(f.precio);
      if (i === enfocar) requestAnimationFrame(() => (f.descripcion ? precio : nombre).focus());
      return el('div', { class: 'st-editor-fila' }, nombre, precio,
        el('button', { type: 'button', class: 'st-quitar', 'aria-label': `Quitar ${f.descripcion || 'trabajo'}`,
          onclick: () => { filas.splice(i, 1); pintarFilas(); pintarTotal(); } }, '✕'));
    }));
    if (!filas.length) lista.append(el('p', { class: 'st-nota', text: 'Toca un trabajo de abajo o "＋ Otro trabajo".' }));
  }

  const agregar = (descripcion = '') => {
    filas.push({ descripcion, precio: '' });
    pintarFilas(filas.length - 1);
    pintarTotal();
  };

  pintarFilas();
  pintarTotal();

  const nodo = el('div', { class: 'st-editor-trabajos' },
    lista,
    el('div', { class: 'st-chips st-atajos' },
      ...TRABAJOS_COMUNES.map((t) => el('button', { type: 'button', class: 'st-chip', onclick: () => agregar(t) }, `＋ ${t}`)),
      el('button', { type: 'button', class: 'st-chip', onclick: () => agregar('') }, '＋ Otro trabajo')),
    el('label', { class: 'st-editor-descuento' }, el('span', { text: '🏷️ Descuento' }), entradaDescuento),
    totalNodo);

  return {
    nodo,
    valor,
    /** Reemplaza todo (p. ej. cuando la IA llena el formulario). */
    poner(nuevos = [], nuevoDescuento = 0) {
      filas.splice(0, filas.length, ...nuevos.map((t) => ({ descripcion: t.descripcion, precio: t.precio })));
      desc = Number(nuevoDescuento) || 0;
      entradaDescuento.value = desc ? String(desc) : '';
      pintarFilas();
      pintarTotal();
    },
  };
}
