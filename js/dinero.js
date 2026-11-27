// ─────────────────────────────────────────────────────────────
// CAMPOS DE DINERO: se ven con separador de miles MIENTRAS se escribe
// ("900000" se ve "900.000", igual que en el resto de la app).
// Truco: el campo MUESTRA el número con puntos, pero cuando el código lee
// campo.value recibe solo los dígitos ("900000"), así Number(campo.value)
// sigue funcionando en toda la app sin cambiar nada más.
// ─────────────────────────────────────────────────────────────

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
export const conPuntos = (v) => { const d = soloDigitos(v); return d ? Number(d).toLocaleString('es-CO') : ''; };

/** Convierte un <input> en campo de dinero. Devuelve el mismo input. */
export function hacerDinero(input) {
  const VALOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.classList.add('campo-dinero');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return soloDigitos(VALOR.get.call(this)); },
    set(v) { VALOR.set.call(this, conPuntos(v)); },
  });
  // Al escribir: se ponen los puntos y el cursor queda después del mismo dígito
  input.addEventListener('input', () => {
    const crudo = VALOR.get.call(input);
    const cursor = input.selectionStart ?? crudo.length;
    const digitosAntes = crudo.slice(0, cursor).replace(/\D/g, '').length;
    const bonito = conPuntos(crudo);
    if (bonito === crudo) return;
    VALOR.set.call(input, bonito);
    let pos = 0;
    for (let vistos = 0; pos < bonito.length && vistos < digitosAntes; pos += 1) if (/\d/.test(bonito[pos])) vistos += 1;
    try { input.setSelectionRange(pos, pos); } catch { /* algunos navegadores no dejan */ }
  }, true);
  const actual = input.getAttribute('value');
  if (actual) input.value = actual;
  return input;
}
