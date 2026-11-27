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
    { categoria: 'celulares', subtipo: 'xiaomi', modelo: 'Redmi 13C', detalle: '128 GB · 6 GB RAM', quedan: 'solo negro', creado_por: 'Patricia', creado_en: haceMinutos(20) },
    { categoria: 'celulares', subtipo: 'samsung', modelo: 'Samsung Galaxy A15', detalle: '128 GB · 4 GB RAM', quedan: '', creado_por: 'Osman', creado_en: haceMinutos(140) },
    { categoria: 'servicio', subtipo: 'tapas', modelo: 'Redmi 13C', detalle: 'color azul', quedan: '', creado_por: 'Osman', creado_en: haceMinutos(70) },
    { categoria: 'servicio', subtipo: 'pantallas', modelo: 'iPhone 11', detalle: '', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(15) },
    { categoria: 'vidrios', subtipo: 'camara', modelo: 'iPhone 15 Pro', detalle: '', quedan: '', creado_por: 'Patricia', creado_en: haceMinutos(8) },
    { categoria: 'forros', subtipo: 'silicona', modelo: 'Redmi A7 Pro', detalle: '', quedan: 'azul y negro', creado_por: 'Jefe 1', creado_en: haceMinutos(12) },
    { categoria: 'forros', subtipo: 'lujo', modelo: 'iPhone 15 Pro Max', detalle: 'con MagSafe', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(95) },
    { categoria: 'vidrios', subtipo: 'blindado', modelo: 'Galaxy A15', detalle: '', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(30) },
    { categoria: 'vidrios', subtipo: 'antiespia', modelo: 'iPhone 13', detalle: '', quedan: '2 unidades', creado_por: 'Jefe 2', creado_en: haceMinutos(300) },
    { categoria: 'cables', subtipo: null, modelo: 'Samsung', detalle: 'USB-C · carga rápida · 1 m', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(60 * 26) },
    { categoria: 'audifonos', subtipo: 'inalambricos', modelo: 'Buds genéricos', detalle: '', quedan: 'solo blancos', creado_por: 'Jefe 1', creado_en: haceMinutos(5) },
    { categoria: 'otros', subtipo: null, modelo: 'Memoria 64GB', detalle: 'micro SD', quedan: '', creado_por: 'Tú', creado_en: haceMinutos(45) },
  ].map((it) => ({ id: nuevoId(), estado: 'pendiente', estado_por: '', estado_en: null, ...it }));
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
    estado: 'pendiente',
    estado_por: '',
    estado_en: null,
  }));
  cambiar([...items, ...nuevos]);
  anotar('agregar', `Tú agregaste ${nuevos.map(describir).join(', ')}`);
}

/** Quita uno o varios productos por id. */
export async function quitar(ids) {
  const fuera = new Set(ids);
  const quitados = items.filter((it) => fuera.has(it.id));
  if (quitados.length) anotar('quitar', `Tú quitaste ${quitados.map(describir).join(', ')}`);
  cambiar(items.filter((it) => !fuera.has(it.id)));
}

/** Modo compras: cambia el estado ('pendiente' | 'comprado' | 'no_conseguido'). */
export async function actualizarEstado(ids, estado, autor = 'Tú') {
  const cuales = new Set(ids);
  const ahora = new Date().toISOString();
  cambiar(items.map((it) => (cuales.has(it.id) && it.estado !== estado
    ? { ...it, estado, estado_por: autor, estado_en: ahora }
    : it)));
}

// ── Historial (modo demo: en el navegador) ──────────────────
const CLAVE_ACTIVIDAD = 'rh-actividad-demo';

function describir(it) {
  return [it.modelo, it.detalle && `(${it.detalle})`].filter(Boolean).join(' ') || it.categoria;
}

function anotar(accion, texto) {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_ACTIVIDAD) || '[]');
    lista.unshift({ id: nuevoId(), creado_en: new Date().toISOString(), quien: 'Tú', accion, texto });
    localStorage.setItem(CLAVE_ACTIVIDAD, JSON.stringify(lista.slice(0, 300)));
  } catch { /* sin almacenamiento */ }
}

export async function listarActividad() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ACTIVIDAD) || '[]'); } catch { return []; }
}

// ── Facturas de compra (modo demo: en el navegador) ─────────
const CLAVE_COMPRAS = 'rh-compras-demo';

export async function borrarCompra(id) {
  const lista = leerFacturas();
  const f = lista.find((x) => x.id === id);
  try { localStorage.setItem(CLAVE_COMPRAS, JSON.stringify(lista.filter((x) => x.id !== id))); } catch { /* sin almacenamiento */ }
  if (f) anotar('borrar_factura', `Tú borraste la factura del ${new Date(f.creada_en).toLocaleString('es-CO')}`);
}

function leerFacturas() {
  try { return JSON.parse(localStorage.getItem(CLAVE_COMPRAS) || '[]'); } catch { return []; }
}

export async function listarCompras() {
  return leerFacturas();
}

/** Guarda la factura, quita lo comprado y deja lo no conseguido marcado. */
export async function cerrarCompra(comprados, noConseguidos, autor = 'Tú') {
  const si = new Set(comprados);
  const no = new Set(noConseguidos);
  const revisados = items.filter((it) => si.has(it.id) || no.has(it.id));
  if (!revisados.length) throw new Error('No hay productos revisados para guardar');
  const ahora = new Date().toISOString();
  const factura = {
    id: nuevoId(),
    creada_en: ahora,
    hecha_por: autor,
    items: revisados
      .map(({ categoria, subtipo, modelo, detalle, quedan, creado_por, id }) =>
        ({ categoria, subtipo, modelo, detalle, quedan, creado_por, resultado: si.has(id) ? 'comprado' : 'no_conseguido' }))
      .sort((a, b) => (a.resultado === 'comprado' ? 0 : 1) - (b.resultado === 'comprado' ? 0 : 1)),
    total_comprados: revisados.filter((it) => si.has(it.id)).length,
    total_no_conseguidos: revisados.filter((it) => !si.has(it.id)).length,
  };
  try { localStorage.setItem(CLAVE_COMPRAS, JSON.stringify([factura, ...leerFacturas()].slice(0, 100))); } catch { /* sin almacenamiento */ }
  const textoSi = revisados.filter((it) => si.has(it.id)).map(describir).join(', ');
  const textoNo = revisados.filter((it) => !si.has(it.id)).map(describir).join(', ');
  anotar('compra', `Tú terminaste una compra${textoSi ? `: compraste ${textoSi}` : ''}${textoNo ? `${textoSi ? ';' : ':'} no se consiguió ${textoNo}` : ''}`);
  cambiar(items
    .filter((it) => !si.has(it.id))
    .map((it) => (no.has(it.id) ? { ...it, estado: 'no_conseguido', estado_por: autor, estado_en: ahora } : it)));
  return factura;
}

export async function vaciar() {
  if (items.length) anotar('vaciar', `Tú vaciaste la lista (${items.length} productos)`);
  cambiar([]);
}

/** Escucha cambios. Devuelve una función para dejar de escuchar. */
export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
