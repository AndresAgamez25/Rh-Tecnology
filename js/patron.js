// ─────────────────────────────────────────────────────────────
// PATRÓN DE DESBLOQUEO (cuadrícula 3x3)
// Puntos numerados así:   1 2 3
//                          4 5 6
//                          7 8 9
// Un patrón se guarda como la lista de puntos en orden, p. ej. [1,2,3,5,7,8,9] (una "Z").
// - dibujoPatron(): SVG para MOSTRARLO (inicio en verde, orden numerado, flechas).
// - crearEditorPatron(): cuadrícula para DIBUJARLO con el dedo.
// ─────────────────────────────────────────────────────────────
const NS = 'http://www.w3.org/2000/svg';
let contadorIds = 0;

function svg(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function posiciones(tam) {
  const m = tam * 0.18;
  const paso = (tam - 2 * m) / 2;
  const pos = {};
  for (let i = 0; i < 9; i += 1) pos[i + 1] = [m + (i % 3) * paso, m + Math.floor(i / 3) * paso];
  return pos;
}

/** Puntos intermedios que se "pasan" al unir dos puntos en línea (como en Android). */
function intermedio(a, b) {
  const [fa, ca] = [Math.floor((a - 1) / 3), (a - 1) % 3];
  const [fb, cb] = [Math.floor((b - 1) / 3), (b - 1) % 3];
  if ((fa + fb) % 2 === 0 && (ca + cb) % 2 === 0) return ((fa + fb) / 2) * 3 + (ca + cb) / 2 + 1;
  return null;
}

/** SVG que muestra un patrón. */
export function dibujoPatron(seq, tam = 200) {
  const pos = posiciones(tam);
  const id = `gp${(contadorIds += 1)}`;
  const raiz = svg('svg', { width: tam, height: tam, viewBox: `0 0 ${tam} ${tam}`, class: 'patron-dibujo', role: 'img', style: `width:${tam}px;height:${tam}px`,
    'aria-label': `Patrón: ${seq.join(', ')}` });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: tam, y2: tam });
  grad.append(svg('stop', { offset: 0, 'stop-color': '#1a4fe0' }), svg('stop', { offset: 1, 'stop-color': '#1eb4ea' }));
  defs.append(grad);
  raiz.append(defs);

  for (let i = 0; i < seq.length - 1; i += 1) {
    const [x1, y1] = pos[seq[i]];
    const [x2, y2] = pos[seq[i + 1]];
    raiz.append(svg('line', { x1, y1, x2, y2, stroke: `url(#${id})`, 'stroke-width': tam * 0.05, 'stroke-linecap': 'round' }));
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    raiz.append(svg('path', { d: 'M -6 -6 L 6 0 L -6 6 Z', fill: '#fff',
      transform: `translate(${(x1 + x2) / 2},${(y1 + y2) / 2}) rotate(${ang})` }));
  }
  for (let p = 1; p <= 9; p += 1) {
    const [x, y] = pos[p];
    const k = seq.indexOf(p);
    if (k >= 0) {
      raiz.append(svg('circle', { cx: x, cy: y, r: tam * 0.07, fill: k === 0 ? '#34d399' : '#1f86ff', stroke: '#0b1428', 'stroke-width': 2 }));
      const t = svg('text', { x, y: y + tam * 0.027, 'text-anchor': 'middle', 'font-size': tam * 0.078, 'font-weight': 800, fill: '#04121f' });
      t.textContent = String(k + 1);
      raiz.append(t);
    } else {
      raiz.append(svg('circle', { cx: x, cy: y, r: tam * 0.035, fill: '#3a4c78' }));
    }
  }
  return raiz;
}

/**
 * Editor para dibujar con el dedo. Devuelve { nodo, valor(), borrar() }.
 * onCambio(seq) se llama al soltar el dedo.
 */
export function crearEditorPatron({ tam = 250, inicial = [], onCambio } = {}) {
  let seq = [...inicial];
  let dibujando = false;
  let dedo = null;
  const caja = document.createElement('div');
  caja.className = 'patron-editor';
  caja.style.touchAction = 'none';

  const pintar = () => {
    const pos = posiciones(tam);
    const dibujo = dibujoPatron(seq, tam);
    if (dibujando && dedo && seq.length) {
      const [x, y] = pos[seq[seq.length - 1]];
      dibujo.insertBefore(svg('line', { x1: x, y1: y, x2: dedo[0], y2: dedo[1], stroke: '#1eb4ea', 'stroke-width': tam * 0.035,
        'stroke-linecap': 'round', opacity: 0.6 }), dibujo.children[1]);
    }
    caja.replaceChildren(dibujo);
  };

  const puntoEn = (x, y) => {
    const pos = posiciones(tam);
    const radio = tam * 0.13;
    for (let p = 1; p <= 9; p += 1) {
      if (Math.hypot(pos[p][0] - x, pos[p][1] - y) < radio) return p;
    }
    return null;
  };

  const coords = (e) => {
    const r = caja.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * tam, ((e.clientY - r.top) / r.height) * tam];
  };

  const agregar = (p) => {
    if (!p || seq.includes(p)) return;
    const ultimo = seq[seq.length - 1];
    const medio = ultimo ? intermedio(ultimo, p) : null;
    if (medio && !seq.includes(medio)) seq.push(medio);
    seq.push(p);
    navigator.vibrate?.(8);
  };

  caja.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    caja.setPointerCapture(e.pointerId);
    dibujando = true;
    seq = [];
    dedo = coords(e);
    agregar(puntoEn(...dedo));
    pintar();
  });
  caja.addEventListener('pointermove', (e) => {
    if (!dibujando) return;
    dedo = coords(e);
    agregar(puntoEn(...dedo));
    pintar();
  });
  const soltar = () => {
    if (!dibujando) return;
    dibujando = false;
    dedo = null;
    pintar();
    onCambio?.([...seq]);
  };
  caja.addEventListener('pointerup', soltar);
  caja.addEventListener('pointercancel', soltar);

  pintar();
  return {
    nodo: caja,
    valor: () => [...seq],
    borrar: () => { seq = []; pintar(); onCambio?.([]); },
  };
}
