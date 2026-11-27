// Hoja inferior (bottom sheet) reutilizable: abrirHoja(titulo, (cerrar) => [nodos]) → Promesa
import { el } from '../ui.js';

export function abrirHoja(titulo, construir) {
  return new Promise((resolver) => {
    const velo = el('div', { class: 'hoja-velo' });
    const hoja = el('div', { class: 'hoja-st', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
    let cerrada = false;
    const cerrar = (valor = null) => {
      if (cerrada) return;
      cerrada = true;
      document.removeEventListener('keydown', alTeclado);
      velo.classList.add('cerrando');
      setTimeout(() => velo.remove(), 200);
      resolver(valor);
    };
    const alTeclado = (e) => { if (e.key === 'Escape') cerrar(null); };
    hoja.append(
      el('div', { class: 'hoja-encabezado' },
        el('h3', { text: titulo }),
        el('button', { type: 'button', class: 'hoja-cerrar', 'aria-label': 'Cerrar', onclick: () => cerrar(null) }, '✕')),
      ...construir(cerrar).filter(Boolean),
    );
    velo.append(hoja);
    velo.addEventListener('click', (e) => { if (e.target === velo) cerrar(null); });
    document.addEventListener('keydown', alTeclado);
    document.body.append(velo);
    requestAnimationFrame(() => velo.classList.add('abierta'));
  });
}
