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
  if (error) throw error;
  if (!data || !Array.isArray(data.acciones)) throw new Error('Respuesta inválida de la IA');
  return data;
}
