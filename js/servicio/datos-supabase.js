// ─────────────────────────────────────────────────────────────
// SERVICIO TÉCNICO · DATOS EN SUPABASE
// Lectura directa (RLS) y escritura SIEMPRE por funciones del servidor
// (crear_orden, cambiar_precio, entregar_orden…), que validan las reglas.
// ─────────────────────────────────────────────────────────────
import { obtenerCliente } from '../supabase.js';

const BUCKET = 'ordenes';
const DIAS_FOTOS = 30;
let canal = null;
const oyentes = new Set();
let temporizador = null;

const sb = () => obtenerCliente();

async function rpc(nombre, args) {
  const { data, error } = await sb().rpc(nombre, args);
  if (error) throw new Error(error.message || 'Error del servidor');
  return data;
}

function avisar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => oyentes.forEach((fn) => fn()), 250);
}

export async function iniciar() {
  canal = sb().channel('servicio-cambios');
  for (const tabla of ['ordenes', 'orden_eventos', 'orden_pagos', 'orden_fotos']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, avisar);
  }
  canal.subscribe();
}

export async function detener() {
  if (canal) await sb().removeChannel(canal);
  canal = null;
}

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Activos y por entregar completos + los últimos 300 entregados, con lo pagado. */
export async function listarOrdenes() {
  const columnas = '*, orden_pagos(monto)';
  const [abiertas, entregadas] = await Promise.all([
    sb().from('ordenes').select(columnas).neq('estado', 'entregado').order('creado_en', { ascending: false }),
    sb().from('ordenes').select(columnas).eq('estado', 'entregado').order('entregado_en', { ascending: false }).limit(300),
  ]);
  if (abiertas.error) throw abiertas.error;
  if (entregadas.error) throw entregadas.error;
  return [...abiertas.data, ...entregadas.data].map(({ orden_pagos: pagos, ...o }) =>
    ({ ...o, pagado: (pagos ?? []).reduce((s, p) => s + p.monto, 0) }));
}

export async function detalle(id) {
  const [o, ev, pa, fo] = await Promise.all([
    sb().from('ordenes').select('*').eq('id', id).single(),
    sb().from('orden_eventos').select('*').eq('orden_id', id).order('id'),
    sb().from('orden_pagos').select('*').eq('orden_id', id).order('id'),
    sb().from('orden_fotos').select('*').eq('orden_id', id).order('creado_en'),
  ]);
  for (const r of [o, ev, pa, fo]) if (r.error) throw r.error;
  const vivas = fo.data.filter((f) => !f.borrada_en);
  let urls = {};
  if (vivas.length) {
    const { data } = await sb().storage.from(BUCKET).createSignedUrls(vivas.map((f) => f.ruta), 3600);
    urls = Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  }
  const pagado = pa.data.reduce((s, p) => s + p.monto, 0);
  return {
    orden: { ...o.data, pagado },
    eventos: ev.data,
    pagos: pa.data,
    fotos: fo.data.map((f) => ({ ...f, url: urls[f.ruta] ?? null })),
  };
}

export const crearOrden = (d) => rpc('crear_orden', { d });
export const actualizarOrden = (id, d) => rpc('actualizar_orden', { p_id: id, d });
export const agregarEvento = (id, tipo, texto) => rpc('agregar_evento', { p_id: id, p_tipo: tipo, p_texto: texto });
export const cambiarPrecio = (id, nuevo, motivo) => rpc('cambiar_precio', { p_id: id, p_nuevo: nuevo, p_motivo: motivo });
export const guardarTrabajos = (id, trabajos, descuento, motivo) =>
  rpc('guardar_trabajos', { p_id: id, p_trabajos: trabajos, p_descuento: descuento, p_motivo: motivo ?? '' });
export const registrarAbono = (id, monto, metodo) => rpc('registrar_abono', { p_id: id, p_monto: monto, p_metodo: metodo });
export const marcarListo = (id, resumen, fotos) => rpc('marcar_listo', { p_id: id, p_resumen: resumen, p_fotos: fotos });
export const devolverSinReparar = (id, motivo, cobro) => rpc('devolver_sin_reparar', { p_id: id, p_motivo: motivo, p_cobro: cobro });
export const reabrir = (id, motivo) => rpc('reabrir_orden', { p_id: id, p_motivo: motivo });
export const entregar = (id, pagos) => rpc('entregar_orden', { p_id: id, p_pagos: pagos });

/** Sube la foto (ya reducida) y la registra en la orden. */
export async function subirFoto(ordenId, blob, etiqueta, momento) {
  const ruta = `${ordenId}/${globalThis.crypto?.randomUUID?.() ?? Date.now()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return rpc('agregar_foto', { p_orden: ordenId, p_ruta: ruta, p_etiqueta: etiqueta, p_momento: momento });
}

/** Borra los archivos de fotos con más de 30 días (el texto de la orden queda). */
export async function limpiarFotosVencidas() {
  const limite = new Date(Date.now() - DIAS_FOTOS * 86_400_000).toISOString();
  const { data, error } = await sb().from('orden_fotos').select('id, ruta')
    .is('borrada_en', null).lt('creado_en', limite).limit(100);
  if (error || !data?.length) return 0;
  await sb().storage.from(BUCKET).remove(data.map((f) => f.ruta));
  return rpc('marcar_fotos_borradas', { p_ids: data.map((f) => f.id) });
}

export async function pagosDesde(desdeISO) {
  const { data, error } = await sb().from('orden_pagos')
    .select('monto, metodo, tipo, creado_en, cobro, orden_id').gte('creado_en', desdeISO).order('creado_en');
  if (error) throw error;
  return data;
}

/** Todo el servicio técnico para la copia de seguridad (sin archivos de fotos). */
export async function copia() {
  const tablas = ['ordenes', 'orden_eventos', 'orden_pagos', 'orden_fotos'];
  const res = await Promise.all(tablas.map((t) => sb().from(t).select('*').limit(100000)));
  return Object.fromEntries(tablas.map((t, i) => [t, res[i].data ?? []]));
}
