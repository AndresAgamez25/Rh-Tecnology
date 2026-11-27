// ─────────────────────────────────────────────────────────────
// GARANTÍAS · MENSAJES DE WHATSAPP (sin número interno)
// ─────────────────────────────────────────────────────────────
import { NEGOCIO, pesos, primerNombre, pie } from '../servicio/whatsapp.js';
import { deISO } from './habiles.js';

const fechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const TIPOS = { celular: '📱 Teléfono', sonido: '🔊 Equipo de sonido', otro: '📦 Otro' };
export const nombreEquipo = (g) => g.equipo || (g.tipo === 'otro' ? g.tipo_otro : { celular: 'teléfono', sonido: 'equipo de sonido' }[g.tipo]) || 'equipo';

export function mensajeRecibida(g) {
  return [
    `Hola ${primerNombre(g.cliente)} 👋, le escribe *${NEGOCIO.nombre}* 📱`,
    '',
    `Recibimos su *${nombreEquipo(g)}* para *garantía* 🛡️.`,
    g.falla ? `⚠️ Falla reportada: ${g.falla}` : '',
    g.fecha_compra ? `🧾 Comprado el ${deISO(g.fecha_compra).toLocaleDateString('es-CO')}${g.valor_compra ? ` por ${pesos(g.valor_compra)}` : ''}` : '',
    '',
    '⏳ *El tiempo de respuesta de la garantía es de hasta 30 días hábiles*, contados desde el día siguiente a la entrega del equipo.',
    g.limite ? `📅 *Fecha máxima de respuesta: ${fechaLarga.format(deISO(g.limite))}*` : '',
    'Le avisaremos por este medio apenas tengamos respuesta.',
    '',
    pie(),
  ].filter((l, i, t) => l !== '' || (i > 0 && t[i - 1] !== '')).join('\n');
}

export function mensajeRespuesta(g) {
  const que = {
    reparado: `Su *${nombreEquipo(g)}* ya regresó *reparado* ✅ y puede pasar a recogerlo.`,
    cambio: `La garantía de su *${nombreEquipo(g)}* fue *aprobada con cambio de equipo* ✅. Puede pasar a recogerlo.`,
    devolucion: `La garantía de su *${nombreEquipo(g)}* fue *aprobada con devolución del dinero* ✅. Puede pasar por la tienda.`,
    rechazada: `El proveedor *no aprobó* la garantía de su *${nombreEquipo(g)}* ❌. Puede pasar a recogerlo.`,
  }[g.resultado] ?? `Ya tenemos respuesta de la garantía de su *${nombreEquipo(g)}*.`;
  return [
    `Hola ${primerNombre(g.cliente)} 👋, le escribe *${NEGOCIO.nombre}*.`,
    '',
    que,
    g.respuesta ? `📝 ${g.respuesta}` : '',
    '',
    'Recuerde traer su cédula. 🪪',
    '',
    pie(),
  ].filter((l, i, t) => l !== '' || (i > 0 && t[i - 1] !== '')).join('\n');
}

export function mensajeEntregada(g) {
  return [
    `Hola ${primerNombre(g.cliente)} 👋, le escribe *${NEGOCIO.nombre}*.`,
    '',
    `✅ Le entregamos su *${nombreEquipo(g)}* y la garantía quedó cerrada.`,
    '',
    '¡Muchas gracias por confiar en nosotros! 🙌 Cualquier cosa que necesite, aquí estamos para servirle.',
    '',
    pie(),
  ].join('\n');
}
