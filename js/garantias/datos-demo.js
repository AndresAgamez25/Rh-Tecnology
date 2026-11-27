// ─────────────────────────────────────────────────────────────
// GARANTÍAS · MODO DEMO (en el navegador)
// Mismas funciones y mismas reglas que la versión de Supabase:
// recibida → enviada → respuesta → entregada; las entregadas no cambian.
// ─────────────────────────────────────────────────────────────
import { sumarHabiles, aISO } from './habiles.js';

const CLAVE = 'rh-garantias-demo';
const YO = 'Tú';
const oyentes = new Set();

const nuevoId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ahora = () => new Date().toISOString();
const hace = (dias) => new Date(Date.now() - dias * 86_400_000);
const RESULTADOS = { reparado: 'reparado', cambio: 'cambio de equipo', devolucion: 'devolución del dinero', rechazada: 'garantía rechazada' };

function semilla() {
  const base = { numero: 20, garantias: [], eventos: [], fotos: [] };
  const g = (d, diasAtras) => {
    base.numero += 1;
    const creado = hace(diasAtras);
    const x = {
      id: nuevoId(), numero: base.numero, estado: 'recibida', resultado: null, cedula: '', telefono: '', tipo: 'celular', tipo_otro: '',
      equipo: '', serial: '', fecha_compra: null, valor_compra: 0, factura: '', falla: '', motivo: '', llego_con: [], llego_con_otro: '',
      estado_recibido: [], estado_recibido_otro: '', limite: aISO(sumarHabiles(creado)), enviado_a: '', guia: '', enviado_en: null,
      respuesta: '', respuesta_en: null, creado_en: creado.toISOString(), creado_por: 'Andrés', entregado_en: null, entregado_por: null, ...d,
    };
    base.garantias.push(x);
    base.eventos.push({ id: base.eventos.length + 1, garantia_id: x.id, creado_en: x.creado_en, autor: 'Andrés', tipo: 'recibida',
      texto: `Se recibió en garantía: ${x.falla}.` });
    return x;
  };
  g({ cliente: 'María López', cedula: '1102345678', telefono: '3005556677', tipo: 'sonido', equipo: 'JBL Flip 6', serial: 'TL0123456',
    fecha_compra: aISO(hace(70)), valor_compra: 450000, factura: 'F-889', falla: 'No carga la batería',
    motivo: 'Se probó con otro cargador y tampoco carga: falla del puerto', llego_con: ['Cargador', 'Caja'], estado_recibido: ['Rayones'] }, 2);
  const e = g({ cliente: 'Pedro Gómez', cedula: '92510111', telefono: '3014447788', tipo: 'celular', equipo: 'Samsung Galaxy A15 · azul',
    serial: '356789104455221', fecha_compra: aISO(hace(40)), valor_compra: 620000, factura: 'F-812', falla: 'Se reinicia solo',
    motivo: 'Se reinicia cada pocos minutos aun después de restablecer', llego_con: ['Caja', 'Cargador'], enviado_a: 'Distribuidor Samsung Sincelejo',
    guia: 'Servientrega 7788', estado: 'enviada', enviado_en: hace(20).toISOString() }, 33);
  base.eventos.push({ id: 90, garantia_id: e.id, creado_en: e.enviado_en, autor: 'Patricia', tipo: 'enviada',
    texto: 'Enviado a Distribuidor Samsung Sincelejo (guía/recibo: Servientrega 7788).' });
  const r = g({ cliente: 'Laura Díaz', cedula: '1103998877', telefono: '3127770011', tipo: 'otro', tipo_otro: 'Reloj inteligente',
    equipo: 'Xiaomi Smart Band 8', fecha_compra: aISO(hace(90)), valor_compra: 180000, falla: 'La pantalla no prende', estado: 'respuesta',
    resultado: 'cambio', respuesta: 'Llegó una manilla nueva', respuesta_en: hace(1).toISOString(), enviado_a: 'Proveedor Xiaomi' }, 25);
  base.eventos.push({ id: 91, garantia_id: r.id, creado_en: r.respuesta_en, autor: 'Andrés', tipo: 'respuesta', texto: 'Respuesta: cambio de equipo. Llegó una manilla nueva.' });
  return base;
}

function cargar() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g?.garantias) return g;
  } catch { /* sin almacenamiento */ }
  return semilla();
}

let db = cargar();

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...db, fotos: db.fotos.map(({ url, ...f }) => f) })); } catch { /* lleno */ }
  oyentes.forEach((fn) => fn());
}

const buscar = (id) => db.garantias.find((g) => g.id === id);
function paraCambiar(id) {
  const g = buscar(id);
  if (!g) throw new Error('La garantía no existe');
  if (g.estado === 'entregada') throw new Error('Las garantías entregadas no se pueden modificar');
  return g;
}
const evento = (id, tipo, texto) => db.eventos.push({ id: Date.now() + Math.random(), garantia_id: id, creado_en: ahora(), autor: YO, tipo, texto });

export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
export async function listar() { return db.garantias.map((g) => ({ ...g })); }

export async function detalle(id) {
  const g = buscar(id);
  if (!g) throw new Error('La garantía no existe');
  return {
    garantia: { ...g },
    eventos: db.eventos.filter((e) => e.garantia_id === id).sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
    fotos: db.fotos.filter((f) => f.garantia_id === id),
  };
}

export async function crear(d) {
  if (!d.cliente?.trim()) throw new Error('Escribe el nombre del cliente');
  db.numero += 1;
  const g = {
    id: nuevoId(), numero: db.numero, estado: 'recibida', resultado: null, cliente: d.cliente.trim(), cedula: d.cedula ?? '',
    telefono: d.telefono ?? '', tipo: d.tipo || 'celular', tipo_otro: d.tipo_otro ?? '', equipo: d.equipo ?? '', serial: d.serial ?? '',
    fecha_compra: d.fecha_compra || null, valor_compra: Number(d.valor_compra) || 0, factura: d.factura ?? '', falla: d.falla ?? '',
    motivo: d.motivo ?? '', llego_con: d.llego_con ?? [], llego_con_otro: d.llego_con_otro ?? '', estado_recibido: d.estado_recibido ?? [],
    estado_recibido_otro: d.estado_recibido_otro ?? '', limite: d.limite || aISO(sumarHabiles(new Date())), enviado_a: '', guia: '',
    enviado_en: null, respuesta: '', respuesta_en: null, creado_en: ahora(), creado_por: YO, entregado_en: null, entregado_por: null,
  };
  db.garantias.push(g);
  evento(g.id, 'recibida', `Se recibió en garantía: ${g.falla || 'sin descripción'}. Respuesta a más tardar el ${g.limite.split('-').reverse().join('/')}.`);
  guardar();
  return { ...g };
}

export async function actualizar(id, d) {
  const g = paraCambiar(id);
  const campos = ['cliente', 'cedula', 'telefono', 'tipo', 'tipo_otro', 'equipo', 'serial', 'fecha_compra', 'valor_compra', 'factura', 'falla', 'motivo'];
  Object.assign(g, Object.fromEntries(Object.entries(d).filter(([k]) => campos.includes(k))));
  evento(id, 'edicion', 'Se editaron los datos.');
  guardar();
  return { ...g };
}

export async function nota(id, tipo, texto) {
  if (!buscar(id)) throw new Error('La garantía no existe');
  if ((texto ?? '').trim().length < 2) throw new Error('Escribe la nota');
  evento(id, tipo, texto.trim());
  guardar();
}

export async function enviar(id, destino, guia, notaEnvio) {
  const g = paraCambiar(id);
  if (g.estado !== 'recibida') throw new Error('Esta garantía ya fue enviada');
  if ((destino ?? '').trim().length < 2) throw new Error('Escribe a quién se envía');
  Object.assign(g, { estado: 'enviada', enviado_a: destino.trim(), guia: (guia ?? '').trim(), enviado_en: ahora() });
  evento(id, 'enviada', `Enviado a ${g.enviado_a}${g.guia ? ` (guía/recibo: ${g.guia})` : ''}${notaEnvio?.trim() ? `. ${notaEnvio.trim()}` : ''}.`);
  guardar();
  return { ...g };
}

export async function responder(id, resultado, detalleRespuesta) {
  const g = paraCambiar(id);
  if (!['recibida', 'enviada'].includes(g.estado)) throw new Error('Esta garantía ya tiene respuesta');
  if (!RESULTADOS[resultado]) throw new Error('Elige el resultado');
  Object.assign(g, { estado: 'respuesta', resultado, respuesta: (detalleRespuesta ?? '').trim(), respuesta_en: ahora() });
  evento(id, 'respuesta', `Respuesta: ${RESULTADOS[resultado]}${g.respuesta ? `. ${g.respuesta}` : ''}.`);
  guardar();
  return { ...g };
}

export async function entregar(id, notaEntrega) {
  const g = paraCambiar(id);
  if (g.estado !== 'respuesta') throw new Error('Primero registra la respuesta de la garantía');
  if (notaEntrega?.trim()) evento(id, 'nota', notaEntrega.trim());
  Object.assign(g, { estado: 'entregada', entregado_en: ahora(), entregado_por: YO });
  evento(id, 'entregada', 'Entregado al cliente.');
  guardar();
  return { ...g };
}

export async function subirFoto(id, blob, etiqueta, momento) {
  paraCambiar(id);
  const url = await new Promise((r) => { const l = new FileReader(); l.onload = () => r(l.result); l.readAsDataURL(blob); });
  const f = { id: nuevoId(), garantia_id: id, ruta: `g/${id}/${nuevoId()}.jpg`, etiqueta, momento, creado_en: ahora(), autor: YO, borrada_en: null, url };
  db.fotos.push(f);
  evento(id, 'foto', `📷 ${etiqueta || 'Foto'}`);
  oyentes.forEach((fn) => fn()); // en demo las fotos viven solo en memoria
  return f;
}

export async function limpiarFotosVencidas() { return 0; }

export async function copia() {
  return { garantias: db.garantias, garantia_eventos: db.eventos, garantia_fotos: db.fotos.map(({ url, ...f }) => f) };
}
