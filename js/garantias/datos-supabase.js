// ─────────────────────────────────────────────────────────────
// GARANTÍAS · DATOS EN SUPABASE
// Lectura directa (RLS) y escritura SIEMPRE por funciones del servidor
// (crear_garantia, enviar_garantia, responder_garantia…).
// Las fotos van al almacenamiento privado "ordenes", carpeta g/<id>/.
// ─────────────────────────────────────────────────────────────
import { obtenerCliente } from '../supabase.js';

const BUCKET = 'ordenes';
const oyentes = new Set();
let canal = null;
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
  canal = sb().channel('garantias-cambios');
  for (const tabla of ['garantias', 'garantia_eventos', 'garantia_fotos', 'devoluciones', 'devolucion_eventos', 'devolucion_fotos']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, avisar);
  }
  canal.subscribe();
}

export async function detener() {
  if (canal) await sb().removeChannel(canal);
  canal = null;
}

export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

/** Abiertas completas + las últimas 300 entregadas. */
export async function listar() {
  const [abiertas, entregadas] = await Promise.all([
    sb().from('garantias').select('*').neq('estado', 'entregada').order('creado_en', { ascending: false }),
    sb().from('garantias').select('*').eq('estado', 'entregada').order('entregado_en', { ascending: false }).limit(300),
  ]);
  if (abiertas.error) throw abiertas.error;
  if (entregadas.error) throw entregadas.error;
  return [...abiertas.data, ...entregadas.data];
}

export async function detalle(id) {
  const [g, ev, fo] = await Promise.all([
    sb().from('garantias').select('*').eq('id', id).single(),
    sb().from('garantia_eventos').select('*').eq('garantia_id', id).order('id'),
    sb().from('garantia_fotos').select('*').eq('garantia_id', id).order('creado_en'),
  ]);
  for (const r of [g, ev, fo]) if (r.error) throw r.error;
  const vivas = fo.data.filter((f) => !f.borrada_en);
  let urls = {};
  if (vivas.length) {
    const { data } = await sb().storage.from(BUCKET).createSignedUrls(vivas.map((f) => f.ruta), 3600);
    urls = Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  }
  return { garantia: g.data, eventos: ev.data, fotos: fo.data.map((f) => ({ ...f, url: urls[f.ruta] ?? null })) };
}

export const crear = (d) => rpc('crear_garantia', { d });
export const actualizar = (id, d) => rpc('actualizar_garantia', { p_id: id, d });
export const nota = (id, tipo, texto) => rpc('nota_garantia', { p_id: id, p_tipo: tipo, p_texto: texto });
export const enviar = (id, destino, guia, notaEnvio) => rpc('enviar_garantia', { p_id: id, p_destino: destino, p_guia: guia, p_nota: notaEnvio });
export const responder = (id, resultado, detalleRespuesta) => rpc('responder_garantia', { p_id: id, p_resultado: resultado, p_detalle: detalleRespuesta });
export const entregar = (id, notaEntrega) => rpc('entregar_garantia', { p_id: id, p_nota: notaEntrega });

export async function subirFoto(id, blob, etiqueta, momento) {
  const ruta = `g/${id}/${globalThis.crypto?.randomUUID?.() ?? Date.now()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return rpc('foto_garantia', { p_id: id, p_ruta: ruta, p_etiqueta: etiqueta, p_momento: momento });
}

/** Borra las fotos de garantías entregadas hace más de 30 días (el texto queda). */
export async function limpiarFotosVencidas() {
  const limite = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await sb().from('garantia_fotos').select('id, ruta, garantias!inner(estado, entregado_en)')
    .is('borrada_en', null).eq('garantias.estado', 'entregada').lt('garantias.entregado_en', limite).limit(100);
  if (error || !data?.length) return 0;
  await sb().storage.from(BUCKET).remove(data.map((f) => f.ruta));
  return rpc('marcar_fotos_garantia_borradas', { p_ids: data.map((f) => f.id) });
}

// ── Productos del local (devoluciones al proveedor) ──────────

export async function listarDevoluciones() {
  const [abiertas, resueltas] = await Promise.all([
    sb().from('devoluciones').select('*').neq('estado', 'resuelto').order('creado_en', { ascending: false }),
    sb().from('devoluciones').select('*').eq('estado', 'resuelto').order('resuelto_en', { ascending: false }).limit(300),
  ]);
  if (abiertas.error) throw abiertas.error;
  if (resueltas.error) throw resueltas.error;
  return [...abiertas.data, ...resueltas.data];
}

export async function detalleDevolucion(id) {
  const [d, ev, fo] = await Promise.all([
    sb().from('devoluciones').select('*').eq('id', id).single(),
    sb().from('devolucion_eventos').select('*').eq('devolucion_id', id).order('id'),
    sb().from('devolucion_fotos').select('*').eq('devolucion_id', id).order('creado_en'),
  ]);
  for (const r of [d, ev, fo]) if (r.error) throw r.error;
  const vivas = fo.data.filter((f) => !f.borrada_en);
  let urls = {};
  if (vivas.length) {
    const { data } = await sb().storage.from(BUCKET).createSignedUrls(vivas.map((f) => f.ruta), 3600);
    urls = Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  }
  return { devolucion: d.data, eventos: ev.data, fotos: fo.data.map((f) => ({ ...f, url: urls[f.ruta] ?? null })) };
}

export const crearDevolucion = (d) => rpc('crear_devolucion', { d });
export const actualizarDevolucion = (id, d) => rpc('actualizar_devolucion', { p_id: id, d });
export const notaDevolucion = (id, texto) => rpc('nota_devolucion', { p_id: id, p_texto: texto });
export const marcarDevuelto = (id, notaDev) => rpc('marcar_devuelto', { p_id: id, p_nota: notaDev });
export const resolverDevolucion = (id, resultado, detalleRes) => rpc('resolver_devolucion', { p_id: id, p_resultado: resultado, p_detalle: detalleRes });

export async function subirFotoDevolucion(id, blob, etiqueta) {
  const ruta = `d/${id}/${globalThis.crypto?.randomUUID?.() ?? Date.now()}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return rpc('foto_devolucion', { p_id: id, p_ruta: ruta, p_etiqueta: etiqueta });
}

export async function limpiarFotosDevoluciones() {
  const limite = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await sb().from('devolucion_fotos').select('id, ruta, devoluciones!inner(estado, resuelto_en)')
    .is('borrada_en', null).eq('devoluciones.estado', 'resuelto').lt('devoluciones.resuelto_en', limite).limit(100);
  if (error || !data?.length) return 0;
  await sb().storage.from(BUCKET).remove(data.map((f) => f.ruta));
  return rpc('marcar_fotos_devolucion_borradas', { p_ids: data.map((f) => f.id) });
}

export async function copia() {
  const tablas = ['garantias', 'garantia_eventos', 'garantia_fotos', 'devoluciones', 'devolucion_eventos', 'devolucion_fotos'];
  const res = await Promise.all(tablas.map((t) => sb().from(t).select('*').limit(100000)));
  return Object.fromEntries(tablas.map((t, i) => [t, res[i].data ?? []]));
}
