// ─────────────────────────────────────────────────────────────
// PIEZAS DE FORMULARIO compartidas (Servicio técnico y Garantías):
// campos de texto, botones de la hoja, selectores tipo "chip" y secciones.
// ─────────────────────────────────────────────────────────────
import { el } from '../ui.js';

export function seccion(titulo, ...hijos) {
  return el('section', { class: 'tarjeta st-seccion' }, el('h4', { class: 'st-seccion-titulo', text: titulo }), ...hijos);
}

export function campoTexto(etiqueta, props = {}) {
  const entrada = el(props.multilinea ? 'textarea' : 'input', { class: 'st-input', rows: props.multilinea ? 3 : null, ...props, multilinea: null });
  if (props.value != null) entrada.value = String(props.value); // <textarea> no usa el atributo value
  return { nodo: el('label', { class: 'campo' }, el('span', { text: etiqueta }), entrada), entrada };
}

export function botonesHoja(cerrar, textoOk, alOk, clase = 'btn-principal') {
  return el('div', { class: 'st-botones st-hoja-botones' },
    el('button', { type: 'button', class: 'btn btn-secundario', onclick: () => cerrar(null) }, 'Cancelar'),
    el('button', { type: 'button', class: `btn ${clase}`, onclick: alOk }, textoOk));
}

export function selectorUnico(opciones, actual, alCambiar) {
  const caja = el('div', { class: 'st-chips' });
  const pintar = (valor) => caja.replaceChildren(...opciones.map(([v, t]) => el('button', {
    type: 'button', class: `st-chip ${v === valor ? 'on' : ''}`, 'aria-pressed': String(v === valor),
    onclick: () => { alCambiar(v); pintar(v); },
  }, t)));
  pintar(actual);
  return caja;
}

export function selectorVarios(opciones, actuales, alCambiar) {
  const sel = new Set(actuales);
  const caja = el('div', { class: 'st-chips' });
  const pintar = () => caja.replaceChildren(...opciones.map((v) => el('button', {
    type: 'button', class: `st-chip ${sel.has(v) ? 'on' : ''}`, 'aria-pressed': String(sel.has(v)),
    onclick: () => { sel.has(v) ? sel.delete(v) : sel.add(v); alCambiar([...sel]); pintar(); },
  }, v)));
  pintar();
  return caja;
}
