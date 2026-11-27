// ─────────────────────────────────────────────────────────────
// DATOS — "fachada"
// La app siempre importa este archivo. Por dentro decide si usar el
// modo demo (localStorage) o Supabase. Así app.js no se entera de
// dónde vienen los datos: solo llama a agregar(), quitar(), etc.
// ─────────────────────────────────────────────────────────────

let fuente = null;
const oyentes = new Set();
let desuscribir = null;

/** modo: 'demo' | 'supabase' */
export async function usar(modo) {
  await detener();
  fuente = modo === 'supabase'
    ? await import('./datos-supabase.js')
    : await import('./datos-demo.js');
  desuscribir = fuente.suscribir((items) => oyentes.forEach((fn) => fn(items)));
  await fuente.iniciar?.();
}

export async function detener() {
  desuscribir?.();
  desuscribir = null;
  await fuente?.detener?.();
  fuente = null;
}

function fuenteActual() {
  if (!fuente) throw new Error('Los datos aún no están listos');
  return fuente;
}

export const listar = () => fuenteActual().listar();
export const agregar = (productos) => fuenteActual().agregar(productos);
export const quitar = (ids) => fuenteActual().quitar(ids);
export const vaciar = () => fuenteActual().vaciar();
export const actualizarEstado = (ids, estado) => fuenteActual().actualizarEstado(ids, estado);
export const cerrarCompra = (comprados, noConseguidos) => fuenteActual().cerrarCompra(comprados, noConseguidos);
export const listarCompras = () => fuenteActual().listarCompras();

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
