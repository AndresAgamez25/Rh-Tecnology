// ─────────────────────────────────────────────────────────────
// CLASIFICADOR DE RESPALDO (sin IA)
// Entiende frases sencillas con palabras clave y devuelve el MISMO
// formato que devolverá Gemini:
//   { acciones: [{tipo:'agregar'|'quitar'|'vaciar', ...}], respuesta }
// Es puro (no toca la pantalla ni la base de datos), por eso es fácil
// de probar: ver /pruebas/clasificador.test.mjs
// ─────────────────────────────────────────────────────────────

/** minúsculas y sin tildes: "Audífono" → "audifono" */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ── Diccionarios de palabras clave ───────────────────────────

const PALABRAS_CATEGORIA = {
  celulares: /\b(celular(es)?|telefonos?|smartphones?|equipos?)\b/,
  // Repuestos de servicio técnico ("tarjeta de memoria" NO es repuesto: va a Otros)
  servicio: /\b(tapas?(\s+traseras?)?|pantallas?|displays?|visor(es)?|lcd|oled|modulos?|tactil(es)?|touch|tarjetas?(?!\s+(de\s+)?(memoria|sd|micro|sim))|placas?|boards?|camaras?|lentes?|pin(es)?|puertos?\s+de\s+carga|centros?\s+de\s+carga|conector(es)?\s+de\s+carga|botones|boton|baterias?|pilas?|microfonos?|altavoz|altavoces|bandejas?(\s+(de\s+)?sim)?|flex|marcos?|chasis|repuestos?)\b/,
  forros: /\b(forros?|fundas?|cases?|covers?|estuches?|carcasas?)\b/,
  vidrios: /\b(vidrios?|vidreos?|micas?|templados?|cristal(es)?|glass|hidrogel|protector(es)?\s+(de\s+)?(pantalla|camara|lente)s?)\b/,
  cables: /\b(cables?|usb|lightning|tipo\s*-?\s*c|micro\s*-?\s*usb|v8)\b/,
  cargadores: /\b(cargador(es)?|cubos?|cabezotes?|adaptador(es)?)\b/,
  audifonos: /\b(audifonos?|auriculares?|airpods?|buds|earbuds|manos\s+libres|diademas?|cascos|headsets?|bluetooth|tws)\b/,
  // Pistas de "Otros": si aparecen primero, ganan.
  otros: /\b(memorias?|micro\s*sd|tarjetas?\s+(de\s+)?(memoria|sd|micro\s*sd|sim)|mouse|ratones?|soportes?|parlantes?|bafles?|teclados?|popsockets?|tripodes?|aros?\s+de\s+luz|relojes?|smartwatch\w*|pendrives?|lapiz|stylus|power\s*banks?|bancos?\s+de\s+(carga|poder))\b/,
};

// Marcas de celulares (también sirven para reconocer un celular sin la palabra "celular")
const MARCAS_CELULAR = {
  samsung: /\b(samsung|galaxy)\b/,
  xiaomi: /\b(xiaomi|redmi|poco)\b/,
  motorola: /\b(motorola|moto)\b/,
  apple: /\b(iphone|apple)\b/,
  tecno: /\b(tecno|spark|camon|pova)\b/,
  infinix: /\b(infinix)\b/,
  honor: /\b(honor)\b/,
  otras: /\b(oppo|realme|vivo|huawei|zte|nokia|alcatel|blu)\b/,
};
// Para ADIVINAR que es un celular solo usamos marcas que no son palabras
// comunes del español (no "poco", "vivo", "honor", "moto"...)
const RE_MARCA = /\b(samsung|galaxy|xiaomi|redmi|motorola|iphone|tecno|infinix|oppo|realme|huawei)\b/;

const PALABRAS_SUBTIPO = {
  celulares: MARCAS_CELULAR,
  // El orden importa: "flex de carga" es pin antes que "flex" (otros)
  servicio: {
    pines: /\b(pin(es)?|puertos?|centros?|conector(es)?|placas?|tarjetas?|flex)\s+de\s+carga\b|\bpin(es)?\b/,
    pantallas: /\b(pantallas?|displays?|visor(es)?|lcd|oled|modulos?|tactil(es)?|touch)\b/,
    tapas: /\b(tapas?(\s+traseras?)?|chasis)\b/,
    tarjetas: /\b(tarjetas?|placas?|boards?)\b/,
    camaras: /\b(camaras?|lentes?)\b/,
    botones: /\b(botones|boton)\b/,
    baterias: /\b(baterias?|pilas?)\b/,
    otros: /\b(microfonos?|altavoz|altavoces|bandejas?|flex|marcos?|repuestos?)\b/,
  },
  forros: {
    silicona: /\b(silicon[ae]?s?|siliconad[oa]s?|soft)\b/,
    lujo: /\b(lujo|lujos[oa]s?|premium|elegantes?|cuero)\b/,
  },
  vidrios: {
    // Protector de los "ojitos" de la cámara (no es vidrio de pantalla)
    camara: /\bprotector(es)?\s+(de\s+)?(camara|lente)s?\b/,
    blindado: /\bblindad[oa]s?\b/,
    titanio: /\btitanio\b/,
    antiespia: /\b(anti\s*-?\s*espias?|privacidad|privacy|privad[oa]s?)\b/,
    curvo: /\b(curv[oa]s?|curvad[oa]s?|curved?)\b/,
    sencillo: /\b(sencill[oa]s?|normal(es)?|basic[oa]s?|clear)\b/,
  },
  audifonos: {
    inalambricos: /\b(inalambric[oa]s?|bluetooth|airpods?|buds|earbuds|tws)\b/,
    cable: /\b((de|con)\s+cable|alambric[oa]s?|cablead[oa]s?|jack)\b/,
  },
};

// Detalles técnicos que se sacan del texto (sobre todo cables/cargadores)
const DETALLES = [
  [/\b(usb\s*-?\s*c|tipo\s*-?\s*c)\b/g, () => 'USB-C'],
  [/\blightning\b/g, () => 'Lightning'],
  [/\b(micro\s*-?\s*usb|v8)\b/g, () => 'Micro USB'],
  [/\b(carga\s+rapida|fast\s+charg\w*|turbo)\b/g, () => 'carga rápida'],
  [/\b(\d+(?:[.,]\d+)?)\s*(m|mts?|metros?)\b/g, (m) => `${m[1].replace(',', '.')} m`],
  [/\b(\d+)\s*(w|watts?|vatios)\b/g, (m) => `${m[1]} W`],
];

// Frases que significan "vaciar la lista"
const RE_VACIAR = /\b(ya\s+se\s+(actualizo|surtio|surtieron|repuso|lleno)(\s+todo)?|ya\s+(llego|se\s+compro)\s+todo|ya\s+se\s+actualizo\s+la\s+lista|borr(ar|a|e|en)\s+todo|vaci(ar|a|e|en)\s+(la\s+)?lista|reinici(ar|a|e|en)\s+(la\s+)?lista|lista\s+(nueva|limpia))\b/g;

// Marcadores de inicio de frase
const AGREGAR = String.raw`no\s+hay|ya\s+no\s+hay|tampoco\s+hay|faltan?|hace[n]?\s+falta|se\s+acab(o|aron)|se\s+agot(o|aron)|agotad[oa]s?|necesitamos|se\s+necesitan?|necesitan?|se\s+requieren?|requerimos|hay\s+que\s+pedir|pedir`;
const QUITAR = String.raw`llegaron|llego|se\s+compr(o|aron)|compramos|ya\s+hay|ya\s+tenemos|ya\s+surtimos|ya\s+se\s+surtio`;

const RE_AGREGAR = new RegExp(`\\b(${AGREGAR})\\b`);
const RE_QUITAR = new RegExp(`\\b(${QUITAR})\\b`);

// "quedan azul y negro", "solo hay rojo", "queda 1"
const RE_QUEDAN = /,?\s*\b(?:(?:solo|solamente|nada\s+mas)\s+)?(?:quedan?|hay\s+solo|solo\s+hay|solamente\s+hay)\b\s*(?:(?:solo|solamente|en)\s+)?(.*)$/;

// Palabras de relleno que no forman parte del modelo
const RELLENO = new Set(('de del para el la los las lo un una unos unas en con que hay no ya ' +
  'tambien mas y e ni o al por pero color colores tampoco se nos ningun ninguna nada ' +
  'pantalla celular telefono favor porfa unidad unidades hace hacen protector protectores').split(' '));

// Formato bonito de marcas y palabras comunes de modelos
const FORMATO = {
  iphone: 'iPhone', ipad: 'iPad', samsung: 'Samsung', galaxy: 'Galaxy', redmi: 'Redmi',
  xiaomi: 'Xiaomi', poco: 'Poco', motorola: 'Motorola', moto: 'Moto', tecno: 'Tecno',
  spark: 'Spark', camon: 'Camon', infinix: 'Infinix', hot: 'Hot', honor: 'Honor',
  huawei: 'Huawei', oppo: 'Oppo', realme: 'Realme', vivo: 'Vivo', zte: 'ZTE', blade: 'Blade',
  nokia: 'Nokia', alcatel: 'Alcatel', pro: 'Pro', max: 'Max', plus: 'Plus', ultra: 'Ultra',
  lite: 'Lite', mini: 'Mini', note: 'Note', se: 'SE', fe: 'FE', jbl: 'JBL', apple: 'Apple',
  sd: 'SD', usb: 'USB', gb: 'GB', tb: 'TB', xr: 'XR', xs: 'XS', gt: 'GT', nfc: 'NFC', neo: 'Neo',
  edge: 'Edge', play: 'Play', power: 'Power', lte: 'LTE',
};

// ── Utilidades ───────────────────────────────────────────────

/** Encuentra la categoría cuya palabra clave aparece PRIMERO en el texto. */
export function detectarCategoria(texto) {
  let mejor = null;
  let posicion = Infinity;
  for (const [cat, re] of Object.entries(PALABRAS_CATEGORIA)) {
    const m = texto.match(re);
    if (m && m.index < posicion) { mejor = cat; posicion = m.index; }
  }
  return mejor;
}

export function detectarSubtipo(categoria, texto) {
  const opciones = PALABRAS_SUBTIPO[categoria];
  if (!opciones) return null;
  for (const [sub, re] of Object.entries(opciones)) if (re.test(texto)) return sub;
  return null;
}

function formatearPalabra(p) {
  if (FORMATO[p]) return FORMATO[p];
  if (/\d/.test(p)) return p.toUpperCase();          // a15 → A15, 5g → 5G
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// Celulares: "6+128", "4 de ram", "128 gigas", "1 tb"
const DETALLES_CELULAR = [
  [/\b(\d{1,2})\s*\+\s*(\d{2,4})\b/g, (m) => [`${m[2]} GB`, `${m[1]} GB RAM`]],
  [/\b(\d{1,2})\s*(?:gb|gigas?)?\s*(?:de\s+)?ram\b/g, (m) => `${m[1]} GB RAM`],
  [/\b(\d{2,4})\s*(?:gb|gigas?)\b(?:\s+de\s+(?:almacenamiento|memoria(?:\s+interna)?))?/g, (m) => `${m[1]} GB`],
  [/\b(\d{2,4})\s+de\s+(?:almacenamiento|memoria(?:\s+interna)?)\b/g, (m) => `${m[1]} GB`],
  [/\b(\d)\s*(?:tb|teras?)\b/g, (m) => `${m[1]} TB`],
  // "iPhone 13 de 128": número típico de almacenamiento después de "de"
  [/\bde\s+(32|64|128|256|512)\b/g, (m) => `${m[1]} GB`],
];

// Servicio técnico: el color del repuesto es parte de lo que se necesita
const COLORES = 'negr[oa]s?|azul(es)?|blanc[oa]s?|roj[oa]s?|verdes?|dorad[oa]s?|plateado|plata|gris(es)?|morad[oa]s?|rosad[oa]s?|rosa|lila|celeste|amarill[oa]s?|naranja|grafito|beige|cafe';
const DETALLES_SERVICIO = [
  [new RegExp(`\\bcolor\\s+(${COLORES})\\b`, 'g'), (m) => `color ${m[1]}`],
  [new RegExp(`\\b(${COLORES})\\b`, 'g'), (m) => `color ${m[1]}`],
];

/** Saca los detalles técnicos y devuelve {resto, detalles[]} */
function extraerDetalles(texto, categoria = null) {
  const encontrados = [];
  let resto = texto;
  const lista = categoria === 'celulares' ? DETALLES_CELULAR
    : categoria === 'servicio' ? DETALLES_SERVICIO
    : DETALLES;
  for (const [re, formato] of lista) {
    resto = resto.replace(re, (...args) => {
      for (const valor of [formato(args)].flat()) {
        if (!encontrados.includes(valor)) encontrados.push(valor);
      }
      return ' ';
    });
  }
  // Celulares: primero el almacenamiento y luego la RAM ("128 GB · 6 GB RAM")
  if (categoria === 'celulares') encontrados.sort((a, b) => a.includes('RAM') - b.includes('RAM'));
  return { resto, detalles: encontrados };
}

/** Palabras del modelo (sin marcadores, categorías, subtipos ni relleno). */
function palabrasModelo(texto, categoria) {
  let t = texto
    .replace(new RegExp(`\\b(${AGREGAR}|${QUITAR})\\b`, 'g'), ' ')
    .replace(/[^\p{L}\p{N}\s.+-]/gu, ' ');
  for (const [cat, re] of Object.entries(PALABRAS_CATEGORIA)) {
    if (cat !== 'otros') t = t.replace(new RegExp(re.source, 'g'), ' ');
  }
  // En celulares la marca ES parte del modelo ("Redmi 13C"), no se quita
  if (categoria !== 'celulares') {
    for (const sub of Object.values(PALABRAS_SUBTIPO[categoria] ?? {})) {
      t = t.replace(new RegExp(sub.source, 'g'), ' ');
    }
  }
  return t.split(/\s+/).map((p) => p.replace(/^[.+-]+|[.+-]+$/g, '')).filter((p) => p && !RELLENO.has(p));
}

/** Divide un mensaje en frases, una por producto. */
export function segmentar(texto) {
  const productos = [...Object.values(PALABRAS_CATEGORIA), RE_MARCA].map((re) => re.source).join('|');
  return texto
    // separadores de oración
    .replace(/[.;!?\n]+/g, '|')
    // antes de cada marcador ("no hay", "llegó", ...)
    .replace(new RegExp(`\\s*,?\\s*(?=\\b(?:${AGREGAR}|${QUITAR})\\b)`, 'g'), '|')
    // "pero", "ni"
    .replace(/\s*,?\s*\b(pero|ni)\b\s*/g, '|')
    // ", y" o "," seguido de otro producto ("forro A15 y vidrio A25")
    .replace(new RegExp(`\\s*(?:,\\s*(?:y\\s+)?|\\s+y\\s+)(?=(?:(?:el|la|los|las|un|una|unos|unas)\\s+)?(?:${productos}))`, 'g'), '|')
    .split('|')
    .map((s) => s.replace(/^[\s,]*(?:(?:y|e|ya|tambien|pero)\b[\s,]*)*/, '')
                 .replace(/(?:[\s,]+(?:y|e|ya|tambien|pero))*[\s,]*$/, '')
                 .trim())
    .filter(Boolean);
}

/** Busca en la lista los ítems a los que se refiere una frase de "llegó". */
function buscarCoincidencias(frase, lista) {
  const categoria = detectarCategoria(frase);
  const subtipo = categoria && categoria !== 'celulares' ? detectarSubtipo(categoria, frase) : null;
  const { resto } = extraerDetalles(frase, categoria);
  const palabras = palabrasModelo(resto, categoria);
  if (!palabras.length && !categoria) return [];

  const puntajes = lista.map((it) => {
    const delItem = new Set(normalizar(`${it.modelo} ${it.detalle}`).split(/[\s·,]+/));
    const aciertos = palabras.filter((p) => delItem.has(p)).length;
    if (palabras.length && aciertos === 0) return 0;
    let puntos = aciertos * 3 + 1;
    if (categoria) { if (it.categoria !== categoria) return 0; puntos += 2; }
    if (subtipo) { if (it.subtipo && it.subtipo !== subtipo) return 0; puntos += 1; }
    return puntos;
  });
  const maximo = Math.max(0, ...puntajes);
  return maximo > 0 ? lista.filter((_, i) => puntajes[i] === maximo) : [];
}

/** Construye la acción "agregar" de una frase. */
function construirItem(frase, quedan, anterior) {
  let categoria = detectarCategoria(frase);
  let subtipo = categoria ? detectarSubtipo(categoria, frase) : null;
  // "No hay forro A15 ni A25" → la segunda frase hereda "forros"
  if (!categoria && anterior) { categoria = anterior.categoria; subtipo = anterior.subtipo; }
  // "No hay Redmi 13C de 128" → sin accesorio pero con marca = celular
  if (!categoria && RE_MARCA.test(frase)) categoria = 'celulares';
  categoria ??= 'otros';
  if (categoria === 'celulares') subtipo = detectarSubtipo('celulares', frase) ?? 'otras';
  if (categoria === 'servicio') subtipo ??= 'otros';

  const { resto, detalles } = extraerDetalles(frase, categoria);
  const modelo = palabrasModelo(resto, categoria).map(formatearPalabra).join(' ');
  return {
    tipo: 'agregar',
    categoria,
    subtipo,
    modelo,
    detalle: detalles.join(' · '),
    quedan: quedan ?? '',
  };
}

function plural(n, uno, varios) { return `${n} ${n === 1 ? uno : varios}`; }

// ── Función principal ────────────────────────────────────────

/**
 * @param {string} texto  Lo que escribió el usuario.
 * @param {Array} lista   Faltantes actuales (para saber qué quitar).
 */
export function clasificar(texto, lista = []) {
  let t = normalizar(texto).replace(/\s+/g, ' ').trim();
  const acciones = [];
  const noEncontrados = [];
  let vigentes = [...lista];

  // 1) ¿Pidió vaciar? Se vacía primero y luego se agrega lo que siga.
  if (new RegExp(RE_VACIAR.source).test(t)) {
    acciones.push({ tipo: 'vaciar' });
    vigentes = [];
    t = t.replace(RE_VACIAR, '|');
  }

  // 2) Recorremos cada frase
  let anterior = null;
  for (const frase of segmentar(t)) {
    // 2a) "Llegó / ya hay ..." → quitar
    if (RE_QUITAR.test(frase) && !RE_AGREGAR.test(frase)) {
      const encontrados = buscarCoincidencias(frase, vigentes);
      if (!encontrados.length) noEncontrados.push(frase.replace(RE_QUITAR, '').trim());
      for (const it of encontrados) {
        acciones.push({ tipo: 'quitar', id: it.id });
        vigentes = vigentes.filter((v) => v.id !== it.id);
      }
      anterior = null;
      continue;
    }

    // 2b) Separar "quedan ..."
    const m = frase.match(RE_QUEDAN);
    const quedan = m ? m[1].replace(/[\s,]+$/, '').trim() : '';
    const producto = m ? frase.slice(0, m.index).trim() : frase;

    // Frase que solo dice "quedan azul" → se lo pega al producto anterior
    if (!palabrasModelo(producto, null).length && !detectarCategoria(producto)) {
      if (quedan && anterior) anterior.quedan = quedan;
      continue;
    }

    // Evitamos basura: debe tener un marcador, una categoría o venir de una frase anterior
    if (!RE_AGREGAR.test(producto) && !detectarCategoria(producto) && !RE_MARCA.test(producto) && !anterior) continue;

    const item = construirItem(producto, quedan, anterior);

    // Si ya existía el mismo producto, lo reemplazamos (actualiza "quedan")
    const repetido = vigentes.find((v) =>
      v.categoria === item.categoria && (v.subtipo ?? null) === item.subtipo &&
      normalizar(v.modelo) === normalizar(item.modelo) && normalizar(v.detalle) === normalizar(item.detalle));
    if (repetido) {
      acciones.push({ tipo: 'quitar', id: repetido.id, reemplazo: true });
      vigentes = vigentes.filter((v) => v.id !== repetido.id);
    }

    acciones.push(item);
    anterior = item;
  }

  return { acciones, respuesta: resumir(acciones, noEncontrados) };
}

function resumir(acciones, noEncontrados) {
  const vacio = acciones.some((a) => a.tipo === 'vaciar');
  const agregados = acciones.filter((a) => a.tipo === 'agregar').length;
  // los "quitar" por reemplazo (actualizar un repetido) no cuentan como quitados
  const quitados = acciones.filter((a) => a.tipo === 'quitar' && !a.reemplazo).length;

  const partes = [];
  if (vacio) partes.push('vacié la lista');
  if (agregados) partes.push(`agregué ${plural(agregados, 'producto', 'productos')}`);
  if (quitados) partes.push(`quité ${plural(quitados, 'producto', 'productos')}`);

  let frase = partes.length
    ? `Listo: ${partes.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
    : '';
  if (noEncontrados.length) frase += `${frase ? ' ' : ''}No encontré en la lista: ${noEncontrados.join(', ')}.`;
  return frase || 'No entendí qué falta. Prueba: «No hay forro de silicona A15, quedan azul».';
}
