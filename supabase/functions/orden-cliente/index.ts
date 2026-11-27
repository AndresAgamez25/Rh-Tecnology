// ─────────────────────────────────────────────────────────────
// EDGE FUNCTION "orden-cliente"
// La usa la página pública orden.html (el enlace que recibe el cliente
// por WhatsApp). Con el código secreto de la orden devuelve SOLO lo que el
// cliente puede ver (equipo, lo que se hizo, saldo y fotos elegidas) y
// enlaces temporales (1 hora) a las fotos. Nunca claves, teléfono ni número
// de orden: eso lo garantiza la función orden_publica() en la base.
// ─────────────────────────────────────────────────────────────
const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const CLAVE_SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const servidor = (ruta: string, init: RequestInit = {}) => fetch(`${URL_BASE}${ruta}`, {
  ...init,
  headers: {
    apikey: CLAVE_SERVICIO,
    Authorization: `Bearer ${CLAVE_SERVICIO}`,
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let codigo = new URL(req.url).searchParams.get('c') ?? '';
  if (!codigo && req.method === 'POST') {
    try { codigo = String((await req.json())?.c ?? ''); } catch { /* sin cuerpo */ }
  }
  // El código es de 32 caracteres hexadecimales: lo validamos antes de consultar
  if (!/^[a-f0-9]{32}$/.test(codigo)) return responder({ error: 'Enlace no válido' }, 404);

  try {
    const r = await servidor('/rest/v1/rpc/orden_publica', { method: 'POST', body: JSON.stringify({ p_codigo: codigo }) });
    if (!r.ok) {
      console.error('orden_publica', r.status, (await r.text()).slice(0, 300));
      return responder({ error: 'No se pudo consultar' }, 502);
    }
    const orden = await r.json();
    if (!orden) return responder({ error: 'Este enlace ya no está disponible' }, 404);

    // Enlaces temporales a las fotos (el almacenamiento es privado)
    const fotos = Array.isArray(orden.fotos) ? orden.fotos : [];
    if (fotos.length) {
      const f = await servidor('/storage/v1/object/sign/ordenes', {
        method: 'POST',
        body: JSON.stringify({ expiresIn: 3600, paths: fotos.map((x: { ruta: string }) => x.ruta) }),
      });
      const firmadas = f.ok ? await f.json() : [];
      const porRuta = new Map((Array.isArray(firmadas) ? firmadas : [])
        .filter((x: { signedURL?: string }) => x.signedURL)
        .map((x: { path: string; signedURL: string }) => [x.path, `${URL_BASE}/storage/v1${x.signedURL}`]));
      orden.fotos = fotos
        .map((x: { ruta: string; etiqueta: string; momento: string }) => ({ url: porRuta.get(x.ruta), etiqueta: x.etiqueta, momento: x.momento }))
        .filter((x: { url?: string }) => x.url);
    }
    return responder(orden);
  } catch (error) {
    console.error(error);
    return responder({ error: 'No se pudo consultar' }, 502);
  }
});
