// Fuente única de verdad: categorías y subtipos de la tienda.
// Si mañana agregan una categoría nueva, solo se cambia aquí.

export const CATEGORIAS = [
  {
    id: 'celulares',
    nombre: 'Celulares',
    // Agrupados por marca; detalle = almacenamiento y RAM
    subtipos: [
      { id: 'samsung', nombre: 'Samsung' },
      { id: 'xiaomi', nombre: 'Xiaomi · Redmi · Poco' },
      { id: 'motorola', nombre: 'Motorola' },
      { id: 'apple', nombre: 'Apple' },
      { id: 'tecno', nombre: 'Tecno' },
      { id: 'infinix', nombre: 'Infinix' },
      { id: 'honor', nombre: 'Honor' },
      { id: 'otras', nombre: 'Otras marcas' },
    ],
  },
  {
    id: 'servicio',
    nombre: 'Servicio técnico',
    // Repuestos para reparar celulares
    subtipos: [
      { id: 'pantallas', nombre: 'Pantallas' },
      { id: 'tapas', nombre: 'Tapas' },
      { id: 'tarjetas', nombre: 'Tarjetas' },
      { id: 'camaras', nombre: 'Cámaras' },
      { id: 'pines', nombre: 'Pines de carga' },
      { id: 'botones', nombre: 'Botones' },
      { id: 'baterias', nombre: 'Baterías' },
      { id: 'otros', nombre: 'Otros repuestos' },
    ],
  },
  {
    id: 'forros',
    nombre: 'Forros',
    subtipos: [
      { id: 'silicona', nombre: 'Silicona' },
      { id: 'lujo', nombre: 'Lujo' },
    ],
  },
  {
    id: 'vidrios',
    nombre: 'Vidrios',
    subtipos: [
      { id: 'sencillo', nombre: 'Sencillo' },
      { id: 'blindado', nombre: 'Blindado' },
      { id: 'titanio', nombre: 'Titanio' },
      { id: 'antiespia', nombre: 'Antiespía' },
      { id: 'curvo', nombre: 'Curvo' },
      { id: 'camara', nombre: 'Protector de cámara' },
    ],
  },
  { id: 'cables', nombre: 'Cables', subtipos: [] },
  { id: 'cargadores', nombre: 'Cargadores', subtipos: [] },
  {
    id: 'audifonos',
    nombre: 'Audífonos',
    subtipos: [
      { id: 'cable', nombre: 'De cable' },
      { id: 'inalambricos', nombre: 'Inalámbricos' },
    ],
  },
  { id: 'otros', nombre: 'Otros', subtipos: [] },
];

/** Devuelve la categoría por id (o "Otros" si no existe). */
export function categoriaPorId(id) {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

/** Nombre bonito de un subtipo, o null si no tiene. */
export function nombreSubtipo(categoriaId, subtipoId) {
  if (!subtipoId) return null;
  const sub = categoriaPorId(categoriaId).subtipos.find((s) => s.id === subtipoId);
  return sub ? sub.nombre : null;
}

/**
 * Asegura que categoría y subtipo sean válidos.
 * Lo usaremos también para revisar lo que responda la IA.
 */
export function normalizarClasificacion(categoria, subtipo) {
  const cat = categoriaPorId(categoria);
  const sub = cat.subtipos.some((s) => s.id === subtipo) ? subtipo : null;
  return { categoria: cat.id, subtipo: sub };
}

/**
 * Clave para saber si dos productos son "el mismo" (igual que en la base de datos):
 * misma categoría y tipo, y mismo nombre sin importar mayúsculas, tildes,
 * espacios ni guiones. "Samsung A-15" = "samsung a15".
 */
export function claveFaltante({ categoria, subtipo, modelo, detalle }) {
  const nombre = `${modelo ?? ''} ${detalle ?? ''}`.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes (la ñ pasa a n, igual que en la base)
    .replace(/[^a-z0-9]/g, '');
  return `${categoria ?? ''}|${subtipo ?? ''}|${nombre}`;
}
