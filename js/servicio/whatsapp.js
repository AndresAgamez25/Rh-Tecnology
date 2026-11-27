// ─────────────────────────────────────────────────────────────
// WHATSAPP DEL NEGOCIO
// Se abre WhatsApp con el mensaje ya escrito y solo se toca "Enviar".
// En Android se pide directamente WhatsApp Business (vinculado al número
// de la tienda); si no está instalado, se abre el WhatsApp normal.
// El número de orden NUNCA va en los mensajes (es solo interno).
// ─────────────────────────────────────────────────────────────
export const NEGOCIO = {
  nombre: 'RH Tecnology',
  lugar: 'Corozal, Sucre',
  horario: 'Lunes a sábado, 8 a. m. a 7 p. m.',
  condiciones: 'Pasados 30 días desde que su equipo esté listo sin reclamarlo, RH Tecnology no responde por él. '
    + 'No respondemos por la información guardada en el celular.',
};

export const pesos = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;
const primerNombre = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';
const pie = () => `📍 ${NEGOCIO.nombre} · ${NEGOCIO.lugar}\n🕗 ${NEGOCIO.horario}`;

/** Detalle del valor: "• Pantalla: $180.000", descuento y total. */
function lineasValor(o, titulo = 'Valor') {
  const trabajos = Array.isArray(o.trabajos) ? o.trabajos : [];
  if (!trabajos.length) return o.precio ? [`💵 ${titulo}: ${pesos(o.precio)}`] : [];
  return [
    `*${titulo}:*`,
    ...trabajos.map((t) => `• ${t.descripcion}: ${pesos(t.precio)}`),
    ...(o.descuento ? [`• Descuento: −${pesos(o.descuento)}`] : []),
    `*Total: ${pesos(o.precio)}*`,
  ];
}

/** "300 123 4567" → "573001234567" (Colombia). */
export function telefonoInternacional(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) return `57${d}`;
  return d;
}

export function abrirWhatsApp(telefono, mensaje) {
  const numero = telefonoInternacional(telefono);
  const texto = encodeURIComponent(mensaje);
  const web = `https://wa.me/${numero}?text=${texto}`;
  if (/android/i.test(navigator.userAgent)) {
    location.href = `intent://send/?phone=${numero}&text=${texto}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;`
      + `S.browser_fallback_url=${encodeURIComponent(web)};end`;
  } else {
    window.open(web, '_blank', 'noopener');
  }
}

/** Enlace a la página que ve el cliente (en la misma app publicada). */
export function enlaceCliente(codigo) {
  const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  return `${base}orden.html?c=${codigo}`;
}

export function mensajeRecibido(o, abono) {
  return [
    `Hola ${primerNombre(o.cliente)} 👋, le escribe *${NEGOCIO.nombre}* 📱`,
    '',
    `Recibimos su *${o.equipo || 'equipo'}*.`,
    o.problema ? `🔧 ${o.problema}` : '',
    '',
    ...lineasValor(o, 'Valor cotizado'),
    abono ? `✅ Abonó: ${pesos(abono)}` : '',
    '',
    'Le avisaremos por este medio cuando esté listo.',
    '',
    `_${NEGOCIO.condiciones}_`,
    '',
    pie(),
  ].filter((l, i, t) => l !== '' || (t[i - 1] !== '' && i > 0)).join('\n');
}

/** o ya trae los trabajos y el precio NUEVOS; antes = total anterior. */
export function mensajePrecio(o, antes, motivo) {
  return [
    `Hola ${primerNombre(o.cliente)} 👋, le escribe *${NEGOCIO.nombre}*.`,
    '',
    motivo ? `Revisando su *${o.equipo || 'equipo'}* encontramos lo siguiente: ${motivo}` : `Actualizamos el valor del arreglo de su *${o.equipo || 'equipo'}*.`,
    '',
    ...lineasValor(o, 'Nuevo valor'),
    `(antes ${pesos(antes)})`,
    '',
    o.precio > antes ? '¿Desea que sigamos con el arreglo?' : 'Cualquier duda, con gusto le atendemos.',
  ].join('\n');
}

export function mensajeListo(o, pasosTodos, enlace) {
  const falta = Math.max(0, o.precio - (o.pagado || 0));
  // Los trabajos ya salen con su precio: aquí solo van los pasos extra
  const nombres = new Set((o.trabajos ?? []).map((t) => t.descripcion.toLowerCase()));
  const pasos = pasosTodos.filter((p) => !nombres.has(p.toLowerCase()));
  return [
    `Hola ${primerNombre(o.cliente)} 👋, le escribe *${NEGOCIO.nombre}* 📱`,
    '',
    `Su *${o.equipo || 'equipo'}* ya está *listo* ✅ y puede pasar a recogerlo.`,
    '',
    ...(o.trabajos?.length ? lineasValor(o, 'Lo que se le hizo') : []),
    ...(pasos.length ? ['', o.trabajos?.length ? '*También:*' : '*Lo que se le hizo:*', ...pasos.map((p) => `• ${p}`), ''] : []),
    ...(o.trabajos?.length ? [] : [`*Total:* ${pesos(o.precio)}`]),
    o.pagado ? `*Abonó:* ${pesos(o.pagado)}` : '',
    falta ? `*Por pagar:* ${pesos(falta)}` : '*Ya está pagado* ✅',
    ...(enlace ? ['', '📷 *Fotos de lo que encontramos y lo que se hizo:*', enlace] : []),
    '',
    pie(),
  ].filter((l) => l !== null).filter((l, i, t) => l !== '' || (i > 0 && t[i - 1] !== '')).join('\n');
}

export function mensajeDevuelto(o, motivo) {
  return [
    `Hola ${primerNombre(o.cliente)} 👋, le escribe *${NEGOCIO.nombre}*.`,
    '',
    `Su *${o.equipo || 'equipo'}* está listo para recoger, pero *no se pudo reparar*: ${motivo}`,
    o.precio ? `\nValor a pagar (revisión): ${pesos(Math.max(0, o.precio - (o.pagado || 0)))}` : '',
    '',
    pie(),
  ].join('\n');
}

export function mensajeRecordatorio(o, dias) {
  return [
    `Hola ${primerNombre(o.cliente)} 👋, le escribe *${NEGOCIO.nombre}*.`,
    '',
    `Le recordamos que su *${o.equipo || 'equipo'}* está listo desde hace ${dias} ${dias === 1 ? 'día' : 'días'} y puede pasar a recogerlo.`,
    '',
    `_${NEGOCIO.condiciones}_`,
    '',
    pie(),
  ].join('\n');
}
