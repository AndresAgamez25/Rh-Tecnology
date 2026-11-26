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

export async function iniciarSesion(email, password) {
  const { error } = await obtenerCliente().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(traducirError(error));
}

export async function cerrarSesion() {
  await obtenerCliente().auth.signOut();
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
 * Avisa cada vez que cambia el usuario (entra, sale o se recupera la sesión).
 * Solo llama a fn cuando cambia el usuario, no en cada renovación del token.
 */
export function alCambiarUsuario(fn) {
  let idActual;
  obtenerCliente().auth.onAuthStateChange((_evento, sesion) => {
    const id = sesion?.user?.id ?? null;
    if (id === idActual) return;
    idActual = id;
    // Supabase recomienda no hacer otras llamadas DENTRO de este callback
    // (puede bloquearse); por eso lo pasamos al siguiente ciclo con setTimeout.
    setTimeout(() => fn(sesion?.user ?? null), 0);
  });
}
