// GARANTÍAS · fachada: modo demo (navegador) o Supabase (de verdad)
let fuente = null;
const oyentes = new Set();
const reenviar = () => oyentes.forEach((fn) => fn());

export async function usar(modo) {
  await fuente?.detener?.();
  fuente = modo === 'supabase' ? await import('./datos-supabase.js') : await import('./datos-demo.js');
  fuente.suscribir(reenviar);
  await fuente.iniciar?.();
}

const f = () => {
  if (!fuente) throw new Error('Garantías aún no está listo');
  return fuente;
};

export const suscribir = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
export const listar = () => f().listar();
export const detalle = (id) => f().detalle(id);
export const crear = (d) => f().crear(d);
export const actualizar = (id, d) => f().actualizar(id, d);
export const nota = (id, tipo, texto) => f().nota(id, tipo, texto);
export const enviar = (id, destino, guia, notaEnvio) => f().enviar(id, destino, guia, notaEnvio);
export const responder = (id, resultado, detalle) => f().responder(id, resultado, detalle);
export const entregar = (id, notaEntrega) => f().entregar(id, notaEntrega);
export const subirFoto = (id, blob, etiqueta, momento) => f().subirFoto(id, blob, etiqueta, momento);
export const limpiarFotosVencidas = () => f().limpiarFotosVencidas();
export const copia = () => f().copia();
// Productos del local (devoluciones al proveedor)
export const listarDevoluciones = () => f().listarDevoluciones();
export const detalleDevolucion = (id) => f().detalleDevolucion(id);
export const crearDevolucion = (d) => f().crearDevolucion(d);
export const actualizarDevolucion = (id, d) => f().actualizarDevolucion(id, d);
export const notaDevolucion = (id, texto) => f().notaDevolucion(id, texto);
export const marcarDevuelto = (id, nota) => f().marcarDevuelto(id, nota);
export const resolverDevolucion = (id, resultado, detalle) => f().resolverDevolucion(id, resultado, detalle);
export const subirFotoDevolucion = (id, blob, etiqueta) => f().subirFotoDevolucion(id, blob, etiqueta);
export const limpiarFotosDevoluciones = () => f().limpiarFotosDevoluciones();
export const listo = () => Boolean(fuente);
