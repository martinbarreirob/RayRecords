import type { CreateList, ListKind } from '../schemas/list';

/**
 * Plantillas para crear listas rápido. Son solo datos: la lista se crea copiando el preset
 * y a partir de ahí es independiente (puede añadir campos, cambiar columnas, etc.).
 * Los campos `money` se guardan en céntimos dentro de `item.extra`.
 */
export type ListPreset = Pick<
  CreateList,
  'name' | 'kind' | 'icon' | 'captureAlias' | 'fieldDefs' | 'board'
>;

export const LIST_PRESETS: Record<ListKind, ListPreset> = {
  media: {
    name: 'Películas',
    kind: 'media',
    icon: 'film',
    captureAlias: 'peli',
    fieldDefs: [
      { key: 'anio', label: 'Año', type: 'number' },
      {
        key: 'estado',
        label: 'Estado',
        type: 'select',
        options: ['pendiente', 'viendo', 'visto', 'abandonado'],
      },
      { key: 'puntuacion', label: 'Puntuación', type: 'rating' },
      { key: 'plataforma', label: 'Plataforma', type: 'text' },
    ],
  },
  shopping: {
    name: 'Compras',
    kind: 'shopping',
    icon: 'shopping-cart',
    captureAlias: 'compra',
    fieldDefs: [
      { key: 'categoria', label: 'Categoría', type: 'text' },
      { key: 'precio', label: 'Precio', type: 'money' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['pendiente', 'comprado'] },
    ],
  },
  board: {
    name: 'Proyecto',
    kind: 'board',
    icon: 'kanban',
    fieldDefs: [
      { key: 'prioridad', label: 'Prioridad', type: 'select', options: ['baja', 'media', 'alta'] },
    ],
    board: {
      columns: [
        { key: 'porHacer', label: 'Por hacer' },
        { key: 'enCurso', label: 'En curso' },
        { key: 'hecho', label: 'Hecho' },
      ],
    },
  },
  free: {
    name: 'Lista libre',
    kind: 'free',
    icon: 'list',
    fieldDefs: [],
  },
};
