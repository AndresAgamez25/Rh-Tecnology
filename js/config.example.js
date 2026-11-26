// ─────────────────────────────────────────────────────────────
// PLANTILLA DE CONFIGURACIÓN
// 1. Copia este archivo y renómbralo a "config.js" (misma carpeta).
// 2. Llena los valores con los de tu proyecto de Supabase
//    (Supabase → Project Settings → API).
// "config.js" está en .gitignore, así que nunca se sube a GitHub.
// (Se usará a partir de la Fase 2.)
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY',
  // Nombre de la Edge Function que habla con Gemini (Fase 3)
  FUNCION_IA: 'procesar',
};
