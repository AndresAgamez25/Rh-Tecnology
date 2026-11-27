// SERVICIO TÉCNICO · fachada: modo demo o Supabase (igual que js/datos.js)
let fuente = null;
const oyentes = new Set();
const reenviar = () => oyentes.forEach((fn) => fn()); // misma función siempre: no se duplica

export async function usar(modo) {
  await fuente?.detener?.();
  fuente = modo === 'supabase' ? await import('./datos-supabase.js') : await import('./datos-demo.js');
  fuente.suscribir(reenviar);
  await fuente.iniciar?.();
}

const f = () => {
  if (!fuente) throw new Error('El servicio técnico aún no está listo');
  return fuente;
};

export const suscribir = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
export const listarOrdenes = () => f().listarOrdenes();
export const detalle = (id) => f().detalle(id);
export const crearOrden = (d) => f().crearOrden(d);
export const actualizarOrden = (id, d) => f().actualizarOrden(id, d);
export const agregarEvento = (id, tipo, texto) => f().agregarEvento(id, tipo, texto);
export const cambiarPrecio = (id, nuevo, motivo) => f().cambiarPrecio(id, nuevo, motivo);
export const guardarTrabajos = (id, trabajos, descuento, motivo) => f().guardarTrabajos(id, trabajos, descuento, motivo);
export const registrarAbono = (id, monto, metodo) => f().registrarAbono(id, monto, metodo);
export const marcarListo = (id, resumen, fotos) => f().marcarListo(id, resumen, fotos);
export const devolverSinReparar = (id, motivo, cobro) => f().devolverSinReparar(id, motivo, cobro);
export const reabrir = (id, motivo) => f().reabrir(id, motivo);
export const entregar = (id, pagos) => f().entregar(id, pagos);
export const subirFoto = (id, blob, etiqueta, momento) => f().subirFoto(id, blob, etiqueta, momento);
export const limpiarFotosVencidas = () => f().limpiarFotosVencidas();
export const pagosDesde = (iso) => f().pagosDesde(iso);
export const copia = () => f().copia();
export const listo = () => Boolean(fuente);
