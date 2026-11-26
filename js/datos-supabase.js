// ─────────────────────────────────────────────────────────────
// DATOS — SUPABASE + TIEMPO REAL
// Mismas funciones que datos-demo.js, pero contra la tabla "faltantes".
//
// ¿Cómo funciona el tiempo real?
// 1. Al iniciar, descargamos la lista completa.
// 2. Nos suscribimos a los cambios de la tabla (Realtime).
// 3. Cuando alguien agrega o quita algo, Supabase nos manda el
//    cambio y actualizamos la lista local sin volver a descargarla.
// 4. Si el celular estuvo dormido (iPhone pausa las apps), al volver
//    descargamos todo de nuevo para no perder nada.
// ─────────────────────────────────────────────────────────────
import { obtenerCliente } from './supabase.js';

const TABLA = 'faltantes';
const COLUMNAS = 'id, categoria, subtipo, modelo, detalle, quedan, creado_en, creado_por';

let items = [];
let canal = null;
const oyentes = new Set();

function avisar() {
  const copia = [...items];
  oyentes.forEach((fn) => fn(copia));
}

function ponerItems(nuevos) {
  items = nuevos;
  avisar();
}

// Agrega o reemplaza por id (evita duplicados cuando llega
// por Realtime algo que nosotros mismos acabamos de insertar).
function fusionar(nuevos) {
  const porId = new Map(items.map((it) => [it.id, it]));
  nuevos.forEach((it) => porId.set(it.id, it));
  ponerItems([...porId.values()]);
}

async function recargar() {
  const { data, error } = await obtenerCliente()
    .from(TABLA)
    .select(COLUMNAS)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  ponerItems(data);
}

function alVolverAlaApp() {
  if (document.visibilityState === 'visible') recargar().catch(console.error);
}

// ── API pública (igual que datos-demo.js) ────────────────────

export async function iniciar() {
  await recargar();

  canal = obtenerCliente()
    .channel('faltantes-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, (cambio) => {
      if (cambio.eventType === 'INSERT') fusionar([cambio.new]);
      if (cambio.eventType === 'DELETE') ponerItems(items.filter((it) => it.id !== cambio.old.id));
      if (cambio.eventType === 'UPDATE') fusionar([cambio.new]);
    })
    .subscribe((estado) => {
      // Al (re)conectar, sincronizamos por si nos perdimos algo
      if (estado === 'SUBSCRIBED') recargar().catch(console.error);
    });

  document.addEventListener('visibilitychange', alVolverAlaApp);
}

export async function detener() {
  document.removeEventListener('visibilitychange', alVolverAlaApp);
  if (canal) await obtenerCliente().removeChannel(canal);
  canal = null;
  ponerItems([]);
}

export async function listar() {
  return [...items];
}

export async function agregar(productos) {
  // creado_por y creado_en los pone el servidor (ver schema.sql)
  const filas = productos.map(({ categoria, subtipo, modelo, detalle, quedan }) =>
    ({ categoria, subtipo: subtipo ?? null, modelo, detalle, quedan }));
  const { data, error } = await obtenerCliente().from(TABLA).insert(filas).select(COLUMNAS);
  if (error) throw error;
  fusionar(data); // se ve al instante, sin esperar a Realtime
}

export async function quitar(ids) {
  const { error } = await obtenerCliente().from(TABLA).delete().in('id', ids);
  if (error) throw error;
  const fuera = new Set(ids);
  ponerItems(items.filter((it) => !fuera.has(it.id)));
}

export async function vaciar() {
  // Supabase exige un filtro en DELETE (protección contra borrados por error).
  // "id no es nulo" = todas las filas.
  const { error } = await obtenerCliente().from(TABLA).delete().not('id', 'is', null);
  if (error) throw error;
  ponerItems([]);
}

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
