// ─────────────────────────────────────────────────────────────
// IA: llama a la Edge Function "procesar" (que habla con Gemini).
// La API key de Gemini NO está aquí: vive como secret en Supabase.
// ─────────────────────────────────────────────────────────────
import { obtenerCliente } from './supabase.js';

const TIEMPO_MAXIMO = 30_000; // si la IA tarda más, usamos el respaldo
let nombreFuncion = 'procesar';

export function configurarIA(nombre) {
  if (nombre) nombreFuncion = nombre;
}

/**
 * @param {{texto?: string, audio?: {base64,mime}, imagen?: {base64,mime}}} entrada
 * @returns {Promise<{acciones: Array, respuesta: string, transcripcion?: string}>}
 */
export async function procesarConIA(entrada) {
  const llamada = obtenerCliente().functions.invoke(nombreFuncion, { body: entrada });
  const limite = new Promise((_, rechazar) =>
    setTimeout(() => rechazar(new Error('La IA tardó demasiado')), TIEMPO_MAXIMO));

  const { data, error } = await Promise.race([llamada, limite]);
  if (error) {
    // La función devuelve { detalle } con la razón (p. ej. "Gemini 429: se acabó la cuota")
    let detalle = '';
    try { detalle = (await error.context?.json?.())?.detalle ?? ''; } catch { /* sin cuerpo */ }
    throw new Error(detalle || error.message || 'La IA no respondió');
  }
  if (!data || !Array.isArray(data.acciones)) throw new Error('Respuesta inválida de la IA');
  return data;
}

/**
 * Servicio técnico: la IA llena el formulario de "Recibir equipo"
 * a partir de un dictado, texto o foto. Devuelve { orden, transcripcion }.
 */
export async function procesarOrdenIA(entrada) {
  const llamada = obtenerCliente().functions.invoke(nombreFuncion, { body: { ...entrada, modo: 'orden' } });
  const limite = new Promise((_, rechazar) =>
    setTimeout(() => rechazar(new Error('La IA tardó demasiado')), TIEMPO_MAXIMO));
  const { data, error } = await Promise.race([llamada, limite]);
  if (error) {
    let detalle = '';
    try { detalle = (await error.context?.json?.())?.detalle ?? ''; } catch { /* sin cuerpo */ }
    throw new Error(detalle || error.message || 'La IA no respondió');
  }
  if (!data?.orden) throw new Error('Respuesta inválida de la IA');
  return data;
}
