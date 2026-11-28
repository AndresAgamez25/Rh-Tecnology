// ─────────────────────────────────────────────────────────────
// SERVICIO TÉCNICO · MODO DEMO (en el navegador)
// Mismas funciones y mismas reglas que la versión de Supabase:
// precio con motivo, no se entrega si debe, entregados inmutables.
// ─────────────────────────────────────────────────────────────
import { limpiarTrabajos, sumaTrabajos } from './trabajos.js';

const CLAVE = 'rh-servicio-demo-v2';
const YO = 'Tú';
const oyentes = new Set();

function nuevoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
const ahora = () => new Date().toISOString();
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString();
const pesos = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;

function semilla() {
  const base = { db: { ordenes: [], eventos: [], pagos: [], fotos: [] }, numero: 140 };
  const o = (datos, minutos) => {
    base.numero += 1;
    const orden = {
      id: nuevoId(), numero: base.numero, codigo: nuevoId().replaceAll('-', ''), estado: 'activo', resultado: null,
      telefono: '', imei: '', claves: [], llego_con: [], llego_con_otro: '', estado_recibido: [], estado_recibido_otro: '',
      tecnico: 'Osman', precio: 0, trabajos: [], descuento: 0, resumen: '', creado_en: hace(minutos), creado_por: 'Andrés',
      listo_en: null, entregado_en: null, entregado_por: null, ...datos,
    };
    base.db.ordenes.push(orden);
    base.db.eventos.push({ id: base.db.eventos.length + 1, orden_id: orden.id, creado_en: orden.creado_en, autor: 'Andrés',
      tipo: 'recibido', texto: `Llegó: ${orden.problema}. Cotizado ${pesos(orden.precio)}.` });
    return orden;
  };
  const a = o({ cliente: 'Carlos Pérez', telefono: '3001234567', equipo: 'Redmi A7 Pro · azul', problema: 'No carga, pin de carga',
    precio: 70000, trabajos: [{ descripcion: 'Pin de carga', precio: 45000 }, { descripcion: 'Tarjeta de carga', precio: 25000 }],
    llego_con: ['SIM', 'Forro'], llego_con_otro: 'llavero', estado_recibido: ['Rayones'],
    claves: [{ tipo: 'patron', valor: [1, 2, 3, 5, 7, 8, 9], nota: 'en Z', funciono: true }] }, 60 * 26);
  base.db.eventos.push(
    { id: 90, orden_id: a.id, creado_en: hace(60 * 22), autor: 'Osman', tipo: 'trabajo', texto: 'Se destapó y se cambió el pin. No funcionó.' },
    { id: 91, orden_id: a.id, creado_en: hace(60 * 21), autor: 'Osman', tipo: 'precio', texto: '+ Tarjeta de carga $25.000. Total $45.000 → $70.000. Motivo: la tarjeta de carga está mala.' },
  );
  base.db.pagos.push({ id: 1, orden_id: a.id, creado_en: a.creado_en, cobro: 'Andrés', monto: 20000, metodo: 'efectivo', tipo: 'abono' });
  o({ cliente: 'Juan Díaz', telefono: '3015552233', equipo: 'Samsung Galaxy A15 · negro', problema: 'No enciende', precio: 50000,
    tecnico: 'Erwin', claves: [{ tipo: 'patron', valor: [1, 4, 7, 8, 9], nota: 'en L' }, { tipo: 'pin', valor: '1985', nota: 'año' }] }, 90);
  const l = o({ cliente: 'Sofía Torres', telefono: '3109876543', equipo: 'iPhone XR', problema: 'Batería', precio: 120000,
    trabajos: [{ descripcion: 'Batería', precio: 100000 }, { descripcion: 'Tapa', precio: 30000 }], descuento: 10000,
    estado: 'por_entregar', resultado: 'reparado', resumen: 'Se cambió la batería', listo_en: hace(60 * 24 * 3) }, 60 * 24 * 5);
  base.db.pagos.push({ id: 2, orden_id: l.id, creado_en: l.creado_en, cobro: 'Patricia', monto: 120000, metodo: 'qr', tipo: 'abono' });
  const e = o({ cliente: 'Luis Vega', telefono: '3148881212', equipo: 'Samsung A54', problema: 'Pantalla rota', precio: 150000,
    estado: 'entregado', resultado: 'reparado', resumen: 'Cambio de pantalla', listo_en: hace(60 * 30), entregado_en: hace(60 * 20),
    entregado_por: 'Patricia' }, 60 * 24 * 2);
  base.db.pagos.push({ id: 3, orden_id: e.id, creado_en: e.entregado_en, cobro: 'Patricia', monto: 150000, metodo: 'efectivo', tipo: 'pago' });
  return base;
}

function cargar() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g?.db) return g;
  } catch { /* sin almacenamiento */ }
  return semilla();
}

let db = cargar();

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...db, db: { ...db.db, fotos: db.db.fotos.map(({ url, ...f }) => f) } })); } catch { /* lleno */ }
  oyentes.forEach((fn) => fn());
}

const buscar = (id) => db.db.ordenes.find((o) => o.id === id);
function paraCambiar(id) {
  const o = buscar(id);
  if (!o) throw new Error('La orden no existe');
  if (o.estado === 'entregado') throw new Error('Las órdenes entregadas no se pueden modificar');
  return o;
}
function evento(ordenId, tipo, texto) {
  db.db.eventos.push({ id: Date.now() + Math.random(), orden_id: ordenId, creado_en: ahora(), autor: YO, tipo, texto });
}
const pagadoDe = (id) => db.db.pagos.filter((p) => p.orden_id === id).reduce((s, p) => s + p.monto, 0);

export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

export async function listarOrdenes() {
  return db.db.ordenes.map((o) => ({ ...o, pagado: pagadoDe(o.id) }));
}

export async function detalle(id) {
  const o = buscar(id);
  if (!o) throw new Error('La orden no existe');
  return {
    orden: { ...o, pagado: pagadoDe(id) },
    eventos: db.db.eventos.filter((e) => e.orden_id === id).sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
    pagos: db.db.pagos.filter((p) => p.orden_id === id),
    fotos: db.db.fotos.filter((f) => f.orden_id === id),
  };
}

export async function crearOrden(d) {
  if (!d.cliente?.trim()) throw new Error('Escribe el nombre del cliente');
  db.numero += 1;
  const o = {
    id: nuevoId(), numero: db.numero, codigo: nuevoId().replaceAll('-', ''), estado: 'activo', resultado: null,
    cliente: d.cliente.trim(), telefono: d.telefono ?? '', equipo: d.equipo ?? '', imei: d.imei ?? '', problema: d.problema ?? '',
    claves: d.claves ?? [], llego_con: d.llego_con ?? [], llego_con_otro: d.llego_con_otro ?? '',
    estado_recibido: d.estado_recibido ?? [], estado_recibido_otro: d.estado_recibido_otro ?? '',
    tecnico: d.tecnico || 'Osman', precio: Number(d.precio) || 0, trabajos: [], descuento: 0, resumen: '', creado_en: ahora(), creado_por: YO,
    listo_en: null, entregado_en: null, entregado_por: null,
  };
  const trabajos = limpiarTrabajos(d.trabajos);
  if (trabajos.length) {
    o.trabajos = trabajos;
    o.descuento = Math.min(Math.max(0, Number(d.descuento) || 0), sumaTrabajos(trabajos));
    o.precio = sumaTrabajos(trabajos) - o.descuento;
  }
  db.db.ordenes.push(o);
  const detalle = trabajos.length ? ` (${trabajos.map((t) => `${t.descripcion} ${pesos(t.precio)}`).join(' + ')}${o.descuento ? ` − descuento ${pesos(o.descuento)}` : ''})` : '';
  evento(o.id, 'recibido', `Llegó: ${o.problema || 'sin descripción'}. Cotizado ${pesos(o.precio)}${detalle}.`);
  if (Number(d.abono) > 0) {
    db.db.pagos.push({ id: Date.now(), orden_id: o.id, creado_en: ahora(), cobro: YO, monto: Number(d.abono), metodo: d.metodo_abono || 'efectivo', tipo: 'abono' });
    evento(o.id, 'pago', `Abonó ${pesos(d.abono)} (${d.metodo_abono || 'efectivo'}).`);
  }
  guardar();
  return { ...o };
}

export async function actualizarOrden(id, d) {
  const o = paraCambiar(id);
  if (d.tecnico && d.tecnico !== o.tecnico) evento(id, 'edicion', `Técnico: ${o.tecnico} → ${d.tecnico}.`);
  if (d.claves && JSON.stringify(d.claves) !== JSON.stringify(o.claves)) evento(id, 'clave', d.nota_clave || 'Se actualizaron las claves.');
  const campos = ['cliente', 'telefono', 'equipo', 'imei', 'problema', 'llego_con', 'llego_con_otro', 'estado_recibido', 'estado_recibido_otro'];
  const cambiados = campos.filter((c) => c in d && JSON.stringify(d[c]) !== JSON.stringify(o[c]));
  const nombres = { cliente: 'cliente', telefono: 'teléfono', equipo: 'equipo', imei: 'IMEI', problema: 'problema',
    llego_con: 'llegó con', llego_con_otro: 'llegó con', estado_recibido: 'estado al recibir', estado_recibido_otro: 'estado al recibir' };
  const lista = [...new Set(cambiados.map((c) => nombres[c]))];
  if (lista.length) evento(id, 'edicion', `Se editó: ${lista.join(', ')}.`);
  Object.assign(o, Object.fromEntries(Object.entries(d).filter(([k]) => [...campos, 'tecnico', 'claves'].includes(k))));
  guardar();
  return { ...o };
}

export async function agregarEvento(id, tipo, texto) {
  const o = buscar(id);
  if (!o) throw new Error('La orden no existe');
  if (o.estado === 'entregado' && !['nota', 'whatsapp'].includes(tipo)) throw new Error('Las órdenes entregadas no se pueden modificar');
  if ((texto ?? '').trim().length < 2) throw new Error('Escribe qué se hizo');
  evento(id, tipo, texto.trim());
  guardar();
}

export async function cambiarPrecio(id, nuevo, motivo) {
  const o = paraCambiar(id);
  if ((motivo ?? '').trim().length < 3) throw new Error('Escribe por qué cambia el precio');
  evento(id, 'precio', `Precio ${pesos(o.precio)} → ${pesos(nuevo)}. Motivo: ${motivo.trim()}`);
  o.precio = Number(nuevo);
  guardar();
  return { ...o };
}

export async function guardarTrabajos(id, trabajosNuevos, descuento, motivo) {
  const o = paraCambiar(id);
  if (o.resultado === 'no_reparado') throw new Error('Este equipo se devolvió sin reparar: vuélvelo al taller para cambiar trabajos');
  const trabajos = limpiarTrabajos(trabajosNuevos);
  const d = Math.min(Math.max(0, Number(descuento) || 0), sumaTrabajos(trabajos));
  const igual = (a, b) => a.descripcion.toLowerCase() === b.descripcion.toLowerCase();
  const partes = [];
  for (const t of trabajos) {
    const antes = (o.trabajos ?? []).find((x) => igual(x, t));
    if (!antes) partes.push(`+ ${t.descripcion} ${pesos(t.precio)}`);
    else if (antes.precio !== t.precio) partes.push(`${t.descripcion} ${pesos(antes.precio)} → ${pesos(t.precio)}`);
  }
  for (const t of o.trabajos ?? []) if (!trabajos.some((x) => igual(x, t))) partes.push(`− ${t.descripcion}`);
  if (d !== (o.descuento ?? 0)) partes.push(`Descuento ${pesos(d)}`);
  const antes = o.precio;
  Object.assign(o, { trabajos, descuento: d, precio: sumaTrabajos(trabajos) - d });
  if (partes.length || o.precio !== antes) {
    evento(id, 'precio', `${partes.join(' · ')}${o.precio !== antes ? `. Total ${pesos(antes)} → ${pesos(o.precio)}` : ''}`
      + `${motivo?.trim() ? `. Motivo: ${motivo.trim()}` : ''}.`);
  }
  guardar();
  return { ...o };
}

export async function registrarAbono(id, monto, metodo) {
  paraCambiar(id);
  db.db.pagos.push({ id: Date.now(), orden_id: id, creado_en: ahora(), cobro: YO, monto: Number(monto), metodo, tipo: 'abono' });
  evento(id, 'pago', `Abonó ${pesos(monto)} (${metodo}).`);
  guardar();
}

export async function marcarListo(id, resumen, fotos) {
  const o = paraCambiar(id);
  if (o.estado !== 'activo') throw new Error('La orden ya está lista');
  db.db.fotos.filter((f) => f.orden_id === id).forEach((f) => { f.visible_cliente = fotos.includes(f.id); });
  Object.assign(o, { estado: 'por_entregar', resultado: 'reparado', listo_en: ahora(), resumen: resumen ?? '' });
  evento(id, 'listo', 'Listo para entregar ✓');
  guardar();
  return { ...o };
}

export async function devolverSinReparar(id, motivo, cobro) {
  const o = paraCambiar(id);
  if ((motivo ?? '').trim().length < 3) throw new Error('Escribe por qué no se reparó');
  Object.assign(o, { estado: 'por_entregar', resultado: 'no_reparado', listo_en: ahora(), precio: Number(cobro) || 0, resumen: motivo.trim() });
  evento(id, 'devuelto', `No se reparó: ${motivo.trim()}. Se cobra ${pesos(o.precio)}.`);
  guardar();
  return { ...o };
}

export async function reabrir(id, motivo) {
  const o = paraCambiar(id);
  const precio = o.resultado === 'no_reparado' && o.trabajos?.length ? sumaTrabajos(o.trabajos) - (o.descuento ?? 0) : o.precio;
  Object.assign(o, { estado: 'activo', resultado: null, listo_en: null, precio });
  evento(id, 'reabierto', `Volvió al taller: ${motivo || 'sin motivo'}`);
  guardar();
  return { ...o };
}

export async function entregar(id, pagos) {
  const o = paraCambiar(id);
  if (o.estado !== 'por_entregar') throw new Error('Primero marca el equipo como listo');
  const nuevos = pagos.filter((p) => Number(p.monto) > 0);
  const total = pagadoDe(id) + nuevos.reduce((s, p) => s + Number(p.monto), 0);
  if (total < o.precio) throw new Error(`Falta por pagar ${pesos(o.precio - total)}`);
  nuevos.forEach((p) => db.db.pagos.push({ id: Date.now() + Math.random(), orden_id: id, creado_en: ahora(), cobro: YO, monto: Number(p.monto), metodo: p.metodo, tipo: 'pago' }));
  if (nuevos.length) evento(id, 'pago', `Pagó ${nuevos.map((p) => `${pesos(p.monto)} (${p.metodo})`).join(' + ')}.`);
  Object.assign(o, { estado: 'entregado', entregado_en: ahora(), entregado_por: YO });
  evento(id, 'entregado', o.resultado === 'no_reparado' ? 'Entregado sin reparar.' : 'Entregado al cliente.');
  guardar();
  return { ...o };
}

export async function subirFoto(ordenId, blob, etiqueta, momento) {
  paraCambiar(ordenId);
  const url = await new Promise((r) => { const lector = new FileReader(); lector.onload = () => r(lector.result); lector.readAsDataURL(blob); });
  const f = { id: nuevoId(), orden_id: ordenId, ruta: `${ordenId}/${nuevoId()}.jpg`, etiqueta, momento, visible_cliente: momento !== 'recibido',
    creado_en: ahora(), autor: YO, borrada_en: null, url };
  db.db.fotos.push(f);
  evento(ordenId, 'foto', `📷 ${etiqueta || 'Foto'}`);
  oyentes.forEach((fn) => fn()); // en demo las fotos viven solo en memoria
  return f;
}

export async function limpiarFotosVencidas() { return 0; }

export async function pagosDesde(iso) {
  return db.db.pagos.filter((p) => p.creado_en >= iso);
}

export async function copia() {
  return { ordenes: db.db.ordenes, orden_eventos: db.db.eventos, orden_pagos: db.db.pagos,
    orden_fotos: db.db.fotos.map(({ url, ...f }) => f) };
}
