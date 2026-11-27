// ─────────────────────────────────────────────────────────────
// PÁGINA DEL CLIENTE (orden.html?c=<código secreto>)
// La abre el cliente desde el WhatsApp de la tienda. Muestra su equipo,
// lo que se hizo, el saldo y las fotos que el técnico eligió.
// No necesita sesión: la Edge Function "orden-cliente" solo entrega
// lo que el cliente puede ver (nunca claves, teléfono ni número de orden).
// SEGURIDAD: todo se pinta con textContent.
// ─────────────────────────────────────────────────────────────
import { el } from './ui.js';
import { NEGOCIO, pesos } from './servicio/whatsapp.js';

const contenido = document.getElementById('contenido');
const MOMENTOS = { recibido: 'Cuando lo recibimos', trabajo: 'Lo que encontramos', resultado: 'Lo que se hizo' };
const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

function mostrarError(titulo, texto) {
  contenido.replaceChildren(
    el('div', { class: 'cliente-tarjeta cliente-centro' },
      el('div', { class: 'vacio-icono', 'aria-hidden': 'true', text: '🔗' }),
      el('h1', { class: 'cliente-titulo', text: titulo }),
      el('p', { class: 'cliente-nota', text: texto })),
    pie(),
  );
}

function pie() {
  return el('footer', { class: 'cliente-pie' },
    el('p', { text: `📍 ${NEGOCIO.nombre} · ${NEGOCIO.lugar}` }),
    el('p', { text: `🕗 ${NEGOCIO.horario}` }),
    el('p', { class: 'cliente-condiciones', text: NEGOCIO.condiciones }));
}

function pintar(o) {
  const falta = Math.max(0, (o.precio || 0) - (o.pagado || 0));
  const noReparado = o.resultado === 'no_reparado';
  const entregado = o.estado === 'entregado';
  const trabajos = Array.isArray(o.trabajos) ? o.trabajos : [];
  const nombres = new Set(trabajos.map((t) => String(t.descripcion).toLowerCase()));
  // Los trabajos salen con su precio abajo; aquí solo lo demás que se anotó
  const pasos = String(o.resumen || '').split(' · ').map((p) => p.trim()).filter((p) => p && !nombres.has(p.toLowerCase()));
  const titulo = entregado ? 'Equipo entregado ✅' : noReparado ? 'No se pudo reparar' : '¡Su equipo está listo! ✅';

  const grupos = ['trabajo', 'resultado', 'recibido']
    .map((m) => [m, (o.fotos || []).filter((f) => f.momento === m)])
    .filter(([, fs]) => fs.length);

  contenido.replaceChildren(
    el('section', { class: 'cliente-tarjeta' },
      el('p', { class: 'cliente-hola', text: `Hola ${o.nombre || ''} 👋` }),
      el('h1', { class: 'cliente-titulo', text: titulo }),
      el('p', { class: 'cliente-equipo', text: `📱 ${o.equipo || 'Su equipo'}` }),
      o.listo_en ? el('p', { class: 'cliente-nota', text: `Listo desde el ${fecha.format(new Date(o.listo_en))}` }) : null),
    pasos.length ? el('section', { class: 'cliente-tarjeta' },
      el('h2', { text: noReparado ? 'Motivo' : trabajos.length ? '🔧 También' : '🔧 Lo que se le hizo' }),
      el('ul', { class: 'cliente-pasos' }, ...pasos.map((p) => el('li', { text: p })))) : null,
    ...grupos.map(([m, fs]) => el('section', { class: 'cliente-tarjeta' },
      el('h2', { text: `📷 ${MOMENTOS[m]}` }),
      el('div', { class: 'cliente-fotos' }, ...fs.map((f) => el('figure', {},
        el('a', { href: f.url, target: '_blank', rel: 'noopener' }, el('img', { src: f.url, alt: f.etiqueta || MOMENTOS[m], loading: 'lazy' })),
        f.etiqueta ? el('figcaption', { text: f.etiqueta }) : null))))),
    el('section', { class: 'cliente-tarjeta' },
      el('h2', { text: trabajos.length ? '🧾 Lo que se le hizo y su valor' : '💵 Valor' }),
      trabajos.length ? el('ul', { class: 'st-trabajos' },
        ...trabajos.map((t) => el('li', {}, el('span', { text: t.descripcion }), el('strong', { text: pesos(t.precio) }))),
        o.descuento ? el('li', { class: 'st-descuento' }, el('span', { text: 'Descuento' }), el('strong', { text: `− ${pesos(o.descuento)}` })) : null,
        el('li', { class: 'st-total' }, el('span', { text: 'Total' }), el('strong', { text: pesos(o.precio) }))) : null,
      el('div', { class: 'st-plata' },
        el('div', {}, el('small', { text: 'Total' }), el('b', { text: pesos(o.precio) })),
        el('div', {}, el('small', { text: 'Pagado' }), el('b', { text: pesos(o.pagado) })),
        el('div', {}, el('small', { text: 'Por pagar' }), el('b', { class: falta ? 'st-debe-txt' : 'st-ok-txt', text: pesos(falta) })))),
    !entregado && o.vence ? el('p', { class: 'cliente-aviso',
      text: `⏳ Puede recogerlo hasta el ${fecha.format(new Date(o.vence))}. Las fotos de esta página se borran al mes.` }) : null,
    pie(),
  );
}

async function iniciar() {
  const codigo = new URLSearchParams(location.search).get('c') ?? '';
  if (!/^[a-f0-9]{32}$/.test(codigo)) {
    mostrarError('Enlace no válido', 'Revise que abrió el enlace completo que le enviamos por WhatsApp.');
    return;
  }
  let config = null;
  try { ({ CONFIG: config } = await import('./config.js')); } catch { /* sin configuración */ }
  if (!config?.SUPABASE_URL) {
    mostrarError('Página no disponible', 'Por favor escríbanos por WhatsApp.');
    return;
  }
  try {
    const r = await fetch(`${config.SUPABASE_URL}/functions/v1/orden-cliente?c=${codigo}`, {
      headers: { apikey: config.SUPABASE_ANON_KEY },
      cache: 'no-store',
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      mostrarError(datos.error || 'Enlace no disponible', 'Si tiene dudas sobre su equipo, escríbanos por WhatsApp.');
      return;
    }
    pintar(datos);
  } catch {
    mostrarError('Sin conexión', 'Revise su internet e intente de nuevo.');
  }
}

iniciar();
