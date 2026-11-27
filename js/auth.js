// ─────────────────────────────────────────────────────────────
// AUTENTICACIÓN (correo + contraseña con Supabase Auth)
// ─────────────────────────────────────────────────────────────
import { obtenerCliente } from './supabase.js';

/** Traduce los errores de Supabase a mensajes claros en español. */
function traducirError(error) {
  const msg = String(error?.message ?? '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('email not confirmed')) return 'Este correo aún no está confirmado.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera un momento.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Sin conexión. Revisa tu internet.';
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

/** Inicia sesión y devuelve el usuario. */
export async function iniciarSesion(email, password) {
  const { data, error } = await obtenerCliente().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(traducirError(error));
  return data.user;
}

/**
 * Cierra la sesión EN ESTE CELULAR. scope 'local' borra la sesión
 * aunque no haya internet (con 'global' podía fallar y dejarla abierta).
 */
export async function cerrarSesion() {
  await obtenerCliente().auth.signOut({ scope: 'local' });
}

/**
 * Devuelve el nombre del usuario si está en la lista permitida,
 * o null si no lo está (la función mi_perfil está en schema.sql).
 */
export async function obtenerPerfil() {
  const { data, error } = await obtenerCliente().rpc('mi_perfil');
  if (error) throw error;
  return data?.[0]?.nombre ?? null;
}

/**
 * Avisa cuando alguien entra, sale o se recupera la sesión al abrir la app.
 * Las renovaciones del token (cada hora) se ignoran: no cambian al usuario.
 * La app decide si el aviso es repetido (ver alCambiarUsuario en app.js).
 */
export function alCambiarUsuario(fn) {
  obtenerCliente().auth.onAuthStateChange((evento, sesion) => {
    if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(evento)) return;
    // Supabase recomienda no hacer otras llamadas DENTRO de este callback
    // (puede bloquearse); por eso lo pasamos al siguiente ciclo con setTimeout.
    setTimeout(() => fn(sesion?.user ?? null), 0);
  });
}
