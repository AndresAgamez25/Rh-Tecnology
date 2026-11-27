// ─────────────────────────────────────────────────────────────
// EDGE FUNCTION "procesar"
// Recibe texto, audio o foto; consulta la lista actual y le pide a
// Gemini que devuelva SOLO acciones en JSON. La app las aplica.
//
// Seguridad:
//  - La API key de Gemini vive solo aquí (secret GEMINI_API_KEY).
//  - La lista se lee con el token del usuario, así que pasa por RLS:
//    si el usuario no está en usuarios_permitidos, se rechaza.
//  - Todo lo que responde la IA se valida antes de devolverlo.
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// Se puede cambiar el modelo sin tocar código con el secret GEMINI_MODEL
// Modelos "Lite": en las pruebas respondieron en ~1 s con resultados correctos,
// mientras los grandes tardaban 15-45 s o estaban saturados.
const MODELOS = [
  Deno.env.get('GEMINI_MODEL'),
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
].filter((m, i, lista): m is string => Boolean(m) && lista.indexOf(m) === i);
let modeloActual = MODELOS[0];
let modeloDescubierto: string | null = null;

/** Lista de modelos a probar; si todos desaparecieran, busca uno disponible. */
async function candidatos() {
  if (modeloDescubierto) return [...MODELOS, modeloDescubierto];
  return MODELOS;
}
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// Solo para pruebas locales (por defecto, la API real de Google)
const GEMINI_BASE = Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com';

const MAX_TEXTO = 1000;
const MAX_BASE64 = 8 * 1024 * 1024; // ~6 MB de archivo
const MAX_ACCIONES = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mismas categorías que js/categorias.js y que los CHECK de la base
const SUBTIPOS: Record<string, string[]> = {
  celulares: ['samsung', 'xiaomi', 'motorola', 'apple', 'tecno', 'infinix', 'honor', 'otras'],
  servicio: ['pantallas', 'tapas', 'tarjetas', 'camaras', 'pines', 'botones', 'baterias', 'otros'],
  forros: ['silicona', 'lujo'],
  vidrios: ['sencillo', 'blindado', 'titanio', 'antiespia', 'curvo', 'camara'],
  cables: [],
  cargadores: [],
  audifonos: ['cable', 'inalambricos'],
  otros: [],
};

type Item = {
  id: string; categoria: string; subtipo: string | null; modelo: string;
  detalle: string; quedan: string; estado: string;
};

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Llama a la base con el token del usuario (RLS aplica). */
async function consultar(ruta: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: token,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) throw Object.assign(new Error(`BD ${r.status}`), { status: r.status });
  return r.json();
}

// ── Instrucciones para Gemini ────────────────────────────────

const INSTRUCCIONES = `Eres el asistente de inventario de RH TECNOLOGY, una tienda de celulares y accesorios en Corozal, Sucre (Colombia).
Un empleado o jefe te dice qué productos FALTAN, cuáles LLEGARON o si la lista se actualizó. Tu trabajo es convertir el mensaje en acciones sobre la lista de faltantes.

CATEGORÍAS (usa exactamente estos ids):
- celulares → los EQUIPOS (teléfonos) que vende la tienda. subtipo = marca: "samsung" | "xiaomi" (incluye Redmi y Poco) | "motorola" | "apple" (iPhone) | "tecno" | "infinix" | "honor" | "otras". "modelo" = marca + modelo oficial (ej. "Redmi 13C", "Samsung Galaxy A15", "iPhone 13"). "detalle" = almacenamiento y RAM con este formato exacto: "128 GB · 6 GB RAM" (solo lo que se diga; "4+128" significa 4 GB de RAM y 128 GB de almacenamiento; "gigas" = GB). El color o colores que quedan van en "quedan".
  Si se menciona un modelo de celular SIN accesorio ("no hay Redmi 13C de 128") es un celular. Si se menciona con accesorio ("forro del Redmi 13C") es el accesorio.
- servicio → REPUESTOS de servicio técnico para reparar celulares (también los que un cliente pidió apartar). subtipo: "pantallas" (pantalla, display, visor, LCD, OLED, módulo, táctil/touch) | "tapas" (tapa, tapa trasera, chasis) | "tarjetas" (tarjeta madre, placa, board) | "camaras" (cámara, lente de cámara) | "pines" (pin de carga, puerto/centro/conector/placa/flex de carga) | "botones" (botones, flex de botones) | "baterias" (batería, pila) | "otros" (micrófono, altavoz, bandeja SIM, flex, marco, otro repuesto). "modelo" = celular al que pertenece, con la escritura oficial ("Redmi 13C", "iPhone XR"). "detalle" = color y otras características ("color azul", "con marco"). "tarjeta" del celular (tarjeta madre/placa) es repuesto, pero "tarjeta de memoria", "tarjeta SD" y "tarjeta SIM" van a "otros"; "protector de cámara" va a vidrios con subtipo "camara".
- forros → subtipo: "silicona" | "lujo" | null. Sinónimos: forro, funda, case, cover, estuche, carcasa; silicona = silicon, silicone, siliconado, soft; lujo = de lujo, lujoso, premium, elegante, cuero.
- vidrios → subtipo: "sencillo" | "blindado" | "titanio" | "antiespia" | "curvo" | "camara" | null. "camara" = protector de cámara / protector de lente (el que se pone sobre los lentes de la cámara, p. ej. de iPhone); NO es un vidrio de pantalla ni una cámara de repuesto.
- cables → subtipo: null (pon en "detalle": tipo USB-C / Lightning / Micro USB, marca, largo, carga rápida)
- cargadores → subtipo: null (detalles en "detalle": vatios, tipo de puerto, marca)
- audifonos → subtipo: "cable" | "inalambricos" | null (bluetooth, airpods, buds = inalambricos)
- otros → subtipo: null (mouse, soportes, memorias, parlantes, relojes, etc.)
Sinónimos: mica/templado/cristal/glass/hidrogel/protector de pantalla o de cámara = vidrio (privacy/privacidad = antiespía; curve = curvo); cubo/cabezote/adaptador = cargador; auriculares/earbuds/buds/manos libres/diadema/cascos/headset = audífonos. Acepta palabras mal escritas o en inglés si es obvio qué son.

REGLAS:
1. "No hay / falta / se acabó / se necesita / hay que pedir X" → {"tipo":"agregar", ...}. "modelo" = modelo del celular (ej. "Redmi A7 Pro", "Galaxy A15", "iPhone 13") o nombre del producto si no es para un celular. Si dice "quedan ..." (colores o cantidades que aún hay), ponlo en "quedan" (ej. "azul y negro").
2. "Ya llegó / se compró / ya hay X" → {"tipo":"quitar","id":"<id>"} usando el id EXACTO de la LISTA ACTUAL que mejor coincida. Si no hay ninguno que coincida, no inventes ids: menciónalo en "respuesta".
3. "Ya se actualizó", "ya se surtió todo", "borrar todo", "lista nueva" → {"tipo":"vaciar"}. Si en el mismo mensaje dice lo que sigue faltando, primero "vaciar" y luego los "agregar".
4. Un mensaje puede traer varios productos: una acción por producto.
5. Corrige nombres de modelos mal dichos o mal escritos cuando sea obvio ("redmi a siete pro" → "Redmi A7 Pro", "ai fon 13" → "iPhone 13", "galaxi a quince" → "Galaxy A15"). Usa la escritura oficial de la marca.
6. Si el producto ya está en la lista igual, no lo dupliques; si cambia "quedan", quita el viejo y agrega el nuevo.
7. AUDIO: transcribe lo que dice en "transcripcion" y aplica las mismas reglas.
8. FOTO: identifica el producto (tipo, y modelo del celular si se ve en la caja o etiqueta) y agrégalo como faltante, salvo que el texto acompañante diga otra cosa.
9. Si el mensaje no tiene nada que ver con productos, no devuelvas acciones y explica en "respuesta".
10. "respuesta": frase corta y amable en español de Colombia que resuma lo que hiciste (máximo 20 palabras).
Usa "" para detalle o quedan vacíos. Nunca escribas HTML.`;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    acciones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        // TODOS los campos son obligatorios (vacíos "" si no aplican):
        // así los modelos rápidos no "olvidan" el modelo o el quedan.
        properties: {
          tipo: { type: 'STRING', enum: ['agregar', 'quitar', 'vaciar'] },
          id: { type: 'STRING', description: 'Solo para quitar: id exacto de la lista. Si no, ""' },
          categoria: { type: 'STRING', description: `Una de: ${Object.keys(SUBTIPOS).join(', ')}. Para quitar/vaciar: ""` },
          subtipo: { type: 'STRING', description: 'Subtipo válido de la categoría o "" si no aplica' },
          modelo: { type: 'STRING', description: 'Modelo del celular o nombre del producto, con la escritura oficial de la marca' },
          detalle: { type: 'STRING', description: 'Detalles técnicos o ""' },
          quedan: { type: 'STRING', description: 'Colores o cantidades que aún quedan, o ""' },
        },
        required: ['tipo', 'id', 'categoria', 'subtipo', 'modelo', 'detalle', 'quedan'],
        propertyOrdering: ['tipo', 'id', 'categoria', 'subtipo', 'modelo', 'detalle', 'quedan'],
      },
    },
    respuesta: { type: 'STRING' },
    transcripcion: { type: 'STRING', description: 'Solo si hubo audio: lo que dijo. Si no, ""' },
  },
  required: ['acciones', 'respuesta', 'transcripcion'],
  propertyOrdering: ['transcripcion', 'acciones', 'respuesta'],
};

// ── Validación de lo que devuelve la IA ──────────────────────

const texto = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '';

function validarAcciones(crudas: unknown, lista: Item[]) {
  const ids = new Set(lista.map((it) => it.id));
  const acciones: Record<string, unknown>[] = [];
  if (!Array.isArray(crudas)) return acciones;

  for (const a of crudas.slice(0, MAX_ACCIONES)) {
    if (!a || typeof a !== 'object') continue;
    const { tipo } = a as Record<string, unknown>;
    if (tipo === 'vaciar') {
      acciones.push({ tipo: 'vaciar' });
    } else if (tipo === 'quitar') {
      const id = String((a as Record<string, unknown>).id ?? '');
      if (ids.has(id)) acciones.push({ tipo: 'quitar', id });
    } else if (tipo === 'agregar') {
      const x = a as Record<string, unknown>;
      const categoria = Object.hasOwn(SUBTIPOS, String(x.categoria)) ? String(x.categoria) : 'otros';
      const subtipo = SUBTIPOS[categoria].includes(String(x.subtipo)) ? String(x.subtipo) : null;
      const modelo = texto(x.modelo, 120);
      const detalle = texto(x.detalle, 200);
      if (!modelo && !detalle) continue;
      acciones.push({ tipo: 'agregar', categoria, subtipo, modelo, detalle, quedan: texto(x.quedan, 120) });
    }
  }
  return acciones;
}

// ── Llamada a Gemini ─────────────────────────────────────────

type Archivo = { base64: string; mime: string };

async function preguntarAGemini(mensaje: string, audio: Archivo | null, imagen: Archivo | null, lista: Item[]) {
  const listaCompacta = lista.map(({ id, categoria, subtipo, modelo, detalle, quedan, estado }) =>
    ({ id, categoria, subtipo, modelo, detalle, quedan, estado }));

  const partes: Record<string, unknown>[] = [
    { text: `LISTA ACTUAL (JSON):\n${JSON.stringify(listaCompacta)}` },
  ];
  if (mensaje) partes.push({ text: `MENSAJE:\n${mensaje}` });
  if (audio) partes.push({ text: 'AUDIO del usuario:' }, { inline_data: { mime_type: audio.mime, data: audio.base64 } });
  if (imagen) partes.push({ text: 'FOTO del producto:' }, { inline_data: { mime_type: imagen.mime, data: imagen.base64 } });

  const cuerpo = JSON.stringify({
    system_instruction: { parts: [{ text: INSTRUCCIONES }] },
    contents: [{ role: 'user', parts: partes }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: ESQUEMA },
  });

  // Probamos los modelos en orden: si uno está saturado (503), sin cuota (429),
  // ya no existe (404) o tarda demasiado, pasamos al siguiente.
  let ultimoDetalle = 'Gemini no respondió';
  for (const modelo of await candidatos()) {
    let r: Response;
    try {
      r = await fetch(`${GEMINI_BASE}/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: cuerpo,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.warn(`${modelo}: ${error}`);
      ultimoDetalle = `Gemini tardó demasiado (${modelo})`;
      continue;
    }
    if (r.ok) {
      modeloActual = modelo;
      return leerRespuesta(await r.json());
    }
    const texto = await r.text();
    ultimoDetalle = resumirError(r.status, texto);
    console.warn(`${modelo}: ${ultimoDetalle}`);
    if (![404, 429, 500, 503].includes(r.status)) break; // 400/403: otro modelo no lo arregla
  }
  // Si TODOS los modelos ya no existen (Google los retiró), buscamos uno nuevo para la próxima
  if (/Gemini 404/.test(ultimoDetalle) && !modeloDescubierto) {
    modeloDescubierto = await buscarModeloFlash();
    if (modeloDescubierto) console.warn(`Próxima vez se probará también ${modeloDescubierto}`);
  }
  throw Object.assign(new Error('Gemini'), { detalle: ultimoDetalle });
}

function leerRespuesta(datos: Record<string, any>) {
  const salida = datos?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  return JSON.parse(salida);
}

/** Pide a Google la lista de modelos de esta clave y elige un Flash estable. */
async function buscarModeloFlash(): Promise<string | null> {
  try {
    const r = await fetch(`${GEMINI_BASE}/v1beta/models?pageSize=200`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const { models = [] } = await r.json();
    const nombres: string[] = models
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => n.includes('flash') && !/(image|tts|audio|live|embedding|thinking)/.test(n));
    // Preferimos estables (sin "preview"/"exp") y no "lite"; los más nuevos primero
    const puntaje = (n: string) => (/(preview|exp|latest)/.test(n) ? 2 : 0) + (n.includes('lite') ? 0 : 1);
    nombres.sort((a, b) => puntaje(a) - puntaje(b) || b.localeCompare(a, 'en', { numeric: true }));
    return nombres[0] ?? null;
  } catch {
    return null;
  }
}

/** Explicación corta y segura del error de Gemini (nunca incluye la clave). */
function resumirError(status: number, cuerpo: string) {
  let msg = '';
  try { msg = JSON.parse(cuerpo)?.error?.message ?? ''; } catch { /* no era JSON */ }
  const pista = status === 429 ? 'se acabó la cuota gratis por ahora'
    : status === 403 || /api key/i.test(msg) ? 'la clave de Gemini no es válida o no tiene permiso'
    : status === 404 ? 'el modelo no está disponible'
    : status === 400 ? 'Gemini no aceptó el contenido'
    : 'error del servicio de Gemini';
  return `Gemini ${status}: ${pista}${msg ? ` (${msg.slice(0, 120)})` : ''}`;
}

function leerArchivo(v: unknown, prefijo: string): Archivo | null {
  if (!v || typeof v !== 'object') return null;
  const { base64, mime } = v as Record<string, unknown>;
  if (typeof base64 !== 'string' || typeof mime !== 'string') return null;
  const tipo = mime.split(';')[0].trim().toLowerCase();
  if (!tipo.startsWith(prefijo) || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
  return { base64, mime: tipo };
}

// ── Servidor ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  const token = req.headers.get('Authorization') ?? '';
  if (!token.startsWith('Bearer ')) return responder({ error: 'Sin sesión' }, 401);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: 'JSON inválido' }, 400);
  }

  const mensaje = texto(cuerpo.texto, MAX_TEXTO);
  const audio = leerArchivo(cuerpo.audio, 'audio/');
  const imagen = leerArchivo(cuerpo.imagen, 'image/');
  if (!mensaje && !audio && !imagen) return responder({ error: 'Mensaje vacío' }, 400);

  try {
    const inicio = Date.now();
    // 1) y 2) AL MISMO TIEMPO: ¿usuario permitido? + lista actual (leída con RLS)
    const [perfil, lista] = await Promise.all([
      consultar('rpc/mi_perfil', token, { method: 'POST', body: '{}' }),
      consultar(
        'faltantes?select=id,categoria,subtipo,modelo,detalle,quedan,estado&order=creado_en.desc&limit=300',
        token,
      ) as Promise<Item[]>,
    ]);
    if (!Array.isArray(perfil) || !perfil.length) return responder({ error: 'Sin permiso' }, 403);
    if (!GEMINI_API_KEY) return responder({ error: 'Falta configurar GEMINI_API_KEY' }, 500);
    const msBase = Date.now() - inicio;

    // 3) Gemini
    const resultado = await preguntarAGemini(mensaje, audio, imagen, lista);
    const msIA = Date.now() - inicio - msBase;
    console.log(`tiempos: base ${msBase} ms · gemini ${msIA} ms`);
    return responder({
      acciones: validarAcciones(resultado?.acciones, lista),
      respuesta: texto(resultado?.respuesta, 200) || 'Listo.',
      transcripcion: texto(resultado?.transcripcion, MAX_TEXTO),
      tiempos: { base: msBase, ia: msIA },
      modelo: modeloActual,
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return responder({ error: 'Sesión vencida o sin permiso' }, 401);
    console.error(error);
    const detalle = (error as { detalle?: string }).detalle
      ?? (error instanceof SyntaxError ? 'Gemini respondió algo que no es JSON' : (error as Error).message);
    return responder({ error: 'No se pudo procesar con IA', detalle, modelo: modeloActual }, 502);
  }
});
