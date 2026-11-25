import type { CreateList, ListKind } from '../schemas/list';

/** Accent colours of a board column (the `.hue-*` tones of the web), in the order they are offered. */
export const BOARD_COLORS = ['blue', 'green', 'amber', 'rose', 'violet', 'teal'] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

/** A column colour may also be any RGB colour, as `#rrggbb`. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The simple icons a board column can show for its state, from not started to finished. */
export const COLUMN_ICONS = [
  'backlog',
  'todo',
  'progress',
  'review',
  'blocked',
  'done',
  'canceled',
] as const;
export type ColumnIcon = (typeof COLUMN_ICONS)[number];

/**
 * Templates to create lists quickly. They are plain data: a list is created by copying the preset
 * and is independent from then on (it can add fields, change columns, etc.).
 * `money` fields are stored in cents inside `item.extra`.
 */
export type ListPreset = Pick<
  CreateList,
  'name' | 'kind' | 'icon' | 'captureAlias' | 'fieldDefs' | 'board'
>;

/** The columns a new board starts with, shared by the board preset and the new-list screen. */
export const DEFAULT_BOARD_COLUMNS: readonly {
  key: string;
  label: string;
  color: BoardColor;
  icon: ColumnIcon;
}[] = [
  { key: 'porHacer', label: 'To do', color: 'blue', icon: 'todo' },
  { key: 'enCurso', label: 'In progress', color: 'amber', icon: 'progress' },
  { key: 'hecho', label: 'Done', color: 'green', icon: 'done' },
];

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
      columns: DEFAULT_BOARD_COLUMNS.map((column) => ({ ...column })),
    },
  },
  free: {
    name: 'Lista libre',
    kind: 'free',
    icon: 'list',
    fieldDefs: [],
  },
};
