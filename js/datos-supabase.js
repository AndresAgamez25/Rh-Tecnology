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
const COLUMNAS = 'id, categoria, subtipo, modelo, detalle, quedan, creado_en, creado_por, estado, estado_por, estado_en';

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

/** Corrige un producto. Lo valida el servidor (editar_faltante): sin repetidos y queda en el historial. */
export async function editar(id, { categoria, subtipo, modelo, detalle, quedan }) {
  const { data, error } = await obtenerCliente().rpc('editar_faltante', {
    p_id: id, p_categoria: categoria, p_subtipo: subtipo ?? '', p_modelo: modelo, p_detalle: detalle, p_quedan: quedan,
  });
  if (error) throw new Error(error.message);
  fusionar(data ?? []);
}

export async function quitar(ids) {
  const { error } = await obtenerCliente().from(TABLA).delete().in('id', ids);
  if (error) throw error;
  const fuera = new Set(ids);
  ponerItems(items.filter((it) => !fuera.has(it.id)));
}

/** Modo compras. Solo se puede cambiar "estado"; quién y cuándo lo pone el servidor. */
export async function actualizarEstado(ids, estado) {
  const { data, error } = await obtenerCliente()
    .from(TABLA).update({ estado }).in('id', ids).select(COLUMNAS);
  if (error) throw error;
  fusionar(data);
}

// ── Facturas de compra ──────────────────────────────────────

export async function listarCompras() {
  const { data, error } = await obtenerCliente()
    .from('compras').select('*').order('creada_en', { ascending: false }).limit(60);
  if (error) throw error;
  return data;
}

/**
 * Cierra la salida de compras en UNA operación del servidor (cerrar_compra):
 * guarda la factura, quita lo comprado y deja lo no conseguido en la lista.
 */
export async function cerrarCompra(comprados, noConseguidos) {
  const { data, error } = await obtenerCliente()
    .rpc('cerrar_compra', { comprados, no_conseguidos: noConseguidos });
  if (error) throw error;
  await recargar();
  return data;
}

/** Borra una factura (queda anotado en el historial quién la borró). */
export async function borrarCompra(id) {
  const { error } = await obtenerCliente().rpc('borrar_compra', { factura_id: id });
  if (error) throw error;
}

/** Historial de actividad (lo escribe la base de datos sola). */
export async function listarActividad() {
  const { data, error } = await obtenerCliente()
    .from('actividad').select('id, creado_en, quien, accion, texto')
    .order('creado_en', { ascending: false }).limit(300);
  if (error) throw error;
  return data;
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
