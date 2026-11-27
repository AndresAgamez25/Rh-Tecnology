// ─────────────────────────────────────────────────────────────
// DÍAS HÁBILES EN COLOMBIA
// Hábil = lunes a viernes que no sea festivo.
// Festivos (Ley 51 de 1983, "Ley Emiliani"):
//  - Fijos: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
//  - Se pasan al lunes siguiente: 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov.
//  - Según la Pascua: Jueves y Viernes Santo, Ascensión (+43), Corpus Christi (+64),
//    Sagrado Corazón (+71), estos tres ya caen en lunes.
// ─────────────────────────────────────────────────────────────
export const DIAS_GARANTIA = 30;

const cache = new Map();
const clave = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const fecha = (a, m, d) => new Date(a, m - 1, d);
const sumar = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const alLunes = (d) => { const dia = d.getDay(); return dia === 1 ? d : sumar(d, (8 - dia) % 7); };

/** Domingo de Pascua (algoritmo de Butcher/Meeus). */
function pascua(a) {
  const b = a % 19; const c = Math.floor(a / 100); const d = a % 100;
  const e = Math.floor(c / 4); const f = c % 4; const g = Math.floor((c + 8) / 25);
  const h = Math.floor((c - g + 1) / 3); const i = (19 * b + c - e - h + 15) % 30;
  const k = Math.floor(d / 4); const l = d % 4; const m = (32 + 2 * f + 2 * k - i - l) % 7;
  const n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31);
  const dia = ((i + m - 7 * n + 114) % 31) + 1;
  return fecha(a, mes, dia);
}

/** Festivos de un año como Set de "aaaa-m-d". */
export function festivos(a) {
  if (cache.has(a)) return cache.get(a);
  const p = pascua(a);
  const lista = [
    fecha(a, 1, 1), fecha(a, 5, 1), fecha(a, 7, 20), fecha(a, 8, 7), fecha(a, 12, 8), fecha(a, 12, 25),
    ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([m, d]) => alLunes(fecha(a, m, d))),
    sumar(p, -3), sumar(p, -2), sumar(p, 43), sumar(p, 64), sumar(p, 71),
  ];
  const set = new Set(lista.map(clave));
  cache.set(a, set);
  return set;
}

export function esHabil(d) {
  const dia = d.getDay();
  return dia !== 0 && dia !== 6 && !festivos(d.getFullYear()).has(clave(d));
}

/** Fecha que resulta de contar n días hábiles DESPUÉS de "desde" (el día de recibido no cuenta). */
export function sumarHabiles(desde, n = DIAS_GARANTIA) {
  let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let contados = 0;
  while (contados < n) {
    d = sumar(d, 1);
    if (esHabil(d)) contados += 1;
  }
  return d;
}

/** Días hábiles que han pasado desde "desde" hasta "hasta" (sin contar el día inicial). */
export function habilesEntre(desde, hasta = new Date()) {
  let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  let n = 0;
  while (d < fin) {
    d = sumar(d, 1);
    if (esHabil(d)) n += 1;
  }
  return n;
}

/** "2027-01-12" (formato de la base de datos), en hora local. */
export const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** "2027-01-12" → Date local (sin el desfase de zona horaria). */
export const deISO = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
