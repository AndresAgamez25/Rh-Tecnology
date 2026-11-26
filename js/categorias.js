// Fuente única de verdad: categorías y subtipos de la tienda.
// Si mañana agregan una categoría nueva, solo se cambia aquí.

export const CATEGORIAS = [
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
