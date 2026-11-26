// ─────────────────────────────────────────────────────────────
// DATOS — MODO DEMO
// Guarda la lista en localStorage del navegador (sin internet ni
// cuenta). Se usa cuando no hay config.js o al abrir la app con ?demo.
// Tiene las mismas funciones que datos-supabase.js.
// ─────────────────────────────────────────────────────────────

const CLAVE = 'rh-faltantes-demo';
const oyentes = new Set();
let items = cargar();

function nuevoId() {
  // crypto.randomUUID solo existe en contextos seguros (https o localhost)
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function haceMinutos(min) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function semilla() {
  return [
    { categoria: 'forros', subtipo: 'silicona', modelo: 'Redmi A7 Pro', detalle: '', quedan: 'azul y negro', creado_por: 'Jefe 1', creado_en: haceMinutos(12) },
    { categoria: 'forros', subtipo: 'lujo', modelo: 'iPhone 15 Pro Max', detalle: 'con MagSafe', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(95) },
    { categoria: 'vidrios', subtipo: 'blindado', modelo: 'Galaxy A15', detalle: '', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(30) },
    { categoria: 'vidrios', subtipo: 'antiespia', modelo: 'iPhone 13', detalle: '', quedan: '2 unidades', creado_por: 'Jefe 2', creado_en: haceMinutos(300) },
    { categoria: 'cables', subtipo: null, modelo: 'Samsung', detalle: 'USB-C · carga rápida · 1 m', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(60 * 26) },
    { categoria: 'audifonos', subtipo: 'inalambricos', modelo: 'Buds genéricos', detalle: '', quedan: 'solo blancos', creado_por: 'Jefe 1', creado_en: haceMinutos(5) },
    { categoria: 'otros', subtipo: null, modelo: 'Memoria 64GB', detalle: 'micro SD', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(45) },
  ].map((it) => ({ id: nuevoId(), ...it }));
}

function cargar() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return JSON.parse(guardado);
  } catch { /* modo privado o almacenamiento bloqueado: usamos la semilla */ }
  return semilla();
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch { /* sin almacenamiento */ }
}

function avisar() {
  const copia = [...items];
  oyentes.forEach((fn) => fn(copia));
}

function cambiar(nuevos) {
  items = nuevos;
  guardar();
  avisar();
}

// "Simulador" de tiempo real: si abres la app en dos pestañas,
// el evento "storage" avisa a la otra pestaña del cambio.
window.addEventListener('storage', (e) => {
  if (e.key === CLAVE) { items = cargar(); avisar(); }
});

// ── API pública ──────────────────────────────────────────────

export async function listar() {
  return [...items];
}

/** Agrega uno o varios productos. */
export async function agregar(productos, autor = 'Tú') {
  const nuevos = productos.map((p) => ({
    id: nuevoId(),
    categoria: p.categoria,
    subtipo: p.subtipo ?? null,
    modelo: p.modelo ?? '',
    detalle: p.detalle ?? '',
    quedan: p.quedan ?? '',
    creado_en: new Date().toISOString(),
    creado_por: autor,
  }));
  cambiar([...items, ...nuevos]);
}

/** Quita uno o varios productos por id. */
export async function quitar(ids) {
  const fuera = new Set(ids);
  cambiar(items.filter((it) => !fuera.has(it.id)));
}

export async function vaciar() {
  cambiar([]);
}

/** Escucha cambios. Devuelve una función para dejar de escuchar. */
export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
