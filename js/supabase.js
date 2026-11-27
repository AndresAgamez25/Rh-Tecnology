// ─────────────────────────────────────────────────────────────
// CLIENTE DE SUPABASE
// Carga config.js (si existe) y crea un único cliente para toda la app.
// La librería se importa desde una CDN con versión FIJA: así una
// actualización de ellos nunca rompe nuestra app por sorpresa.
// ─────────────────────────────────────────────────────────────

const URL_LIBRERIA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

let cliente = null;

/** Lee js/config.js. Devuelve null si no existe o tiene valores de ejemplo. */
export async function cargarConfig() {
  try {
    const { CONFIG } = await import('./config.js');
    const valida = CONFIG?.SUPABASE_URL?.startsWith('https://') &&
      !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') &&
      CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.startsWith('TU-');
    return valida ? CONFIG : null;
  } catch {
    return null; // no hay config.js → modo demo
  }
}

/** Crea el cliente (una sola vez). */
export async function crearCliente(config) {
  if (cliente) return cliente;
  const { createClient, processLock } = await import(URL_LIBRERIA);
  cliente = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      // Candado solo de esta pestaña: en Android, una pestaña vieja congelada
      // podía quedarse con el candado compartido y bloquear el login.
      ...(processLock && { lock: processLock }),
      persistSession: true,      // recuerda la sesión al cerrar la app
      autoRefreshToken: true,    // renueva el token solo
      detectSessionInUrl: false, // no usamos enlaces mágicos
    },
  });
  return cliente;
}

export function obtenerCliente() {
  if (!cliente) throw new Error('Supabase aún no está listo');
  return cliente;
}
