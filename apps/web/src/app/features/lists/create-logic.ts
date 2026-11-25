import {
  BOARD_COLORS,
  DEFAULT_BOARD_COLUMNS,
  type BoardColumn,
  type ColumnIcon,
  type CreateList,
  type FieldDef,
  type FieldType,
} from '@rayrecords/shared';

/** What a new list can be: each one starts a different second step. */
export type NewListType = 'table' | 'board' | 'simple';

/** The kinds of column a table offers, in the order the type button cycles through them. */
export interface ColumnKind {
  type: FieldType;
  label: string;
}

export const COLUMN_KINDS: readonly ColumnKind[] = [
  { type: 'text', label: 'Texto' },
  { type: 'select', label: 'Opciones' },
  { type: 'number', label: 'Número' },
  { type: 'date', label: 'Fecha' },
];

/** A column of the table being defined: what the user typed, before it becomes a field. */
export interface DraftField {
  /** Stable while editing (it identifies the row in the list), not the key that gets saved. */
  id: number;
  /** Set for the columns that already exist (list settings); it never changes. */
  key?: string;
  label: string;
  type: FieldType;
  options: string[];
}

/** A column of the board being defined. */
export interface DraftColumn {
  id: number;
  /** Set for the columns that already exist (list settings); it never changes. */
  key?: string;
  label: string;
  color?: string;
  icon?: ColumnIcon;
}

/** Either kind of row the column editor shows. */
export type DraftRow = DraftField | DraftColumn;

/** The columns a new board starts with: the board preset's, without their keys. */
export const DEFAULT_BOARD: readonly Pick<DraftColumn, 'label' | 'color' | 'icon'>[] =
  DEFAULT_BOARD_COLUMNS.map(({ label, color, icon }) => ({ label, color, icon }));

/** The next kind of column after `type`, wrapping round. */
export function nextKind(type: FieldType): FieldType {
  const index = COLUMN_KINDS.findIndex((kind) => kind.type === type);
  return COLUMN_KINDS[(index + 1) % COLUMN_KINDS.length]!.type;
}

/** Labels of the kinds the cycle button does not offer but a list may already have. */
const EXTRA_KIND_LABELS: Partial<Record<FieldType, string>> = {
  money: 'Dinero',
  rating: 'Valoración',
  url: 'Enlace',
  boolean: 'Sí / No',
};

/** Label of a column kind, including the ones that cannot be picked in the editor. */
export function kindLabel(type: FieldType): string {
  return COLUMN_KINDS.find((kind) => kind.type === type)?.label ?? EXTRA_KIND_LABELS[type] ?? type;
}

/** A colour for the next column of a board: the first not used yet, else round the palette. */
export function nextColor(used: readonly string[]): string {
  return (
    BOARD_COLORS.find((color) => !used.includes(color)) ??
    BOARD_COLORS[used.length % BOARD_COLORS.length]!
  );
}

/** The rows with the one that has `id` changed by `patch`. */
export function patchRow<T extends { id: number }>(
  rows: readonly T[],
  id: number,
  patch: Partial<T>,
): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

/** What changes in a table column when its kind button is pressed: «Opciones» starts with two to edit. */
export function kindPatch(field: DraftField): Pick<DraftField, 'type' | 'options'> {
  const type = nextKind(field.type);
  return {
    type,
    options:
      type === 'select' && field.options.length === 0 ? ['Opción 1', 'Opción 2'] : field.options,
  };
}

/** The options with `typed` added; `null` when it is empty or already there. */
export function withOption(options: readonly string[], typed: string): string[] | null {
  const option = typed.trim();
  if (!option || options.includes(option)) return null;
  return [...options, option];
}

export function withoutOption(options: readonly string[], option: string): string[] {
  return options.filter((o) => o !== option);
}

/** A blank table column. */
export function newField(id: number): DraftField {
  return { id, label: 'Nueva columna', type: 'text', options: [] };
}

/** A blank board column, with the first colour the others do not use. */
export function newColumn(id: number, existing: readonly DraftColumn[]): DraftColumn {
  return {
    id,
    label: 'Nueva columna',
    color: nextColor(existing.flatMap((c) => (c.color ? [c.color] : []))),
  };
}

/** Moves the element at `from` to `to`; the same array when nothing changes. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from === to || from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved as T);
  return copy;
}

/** A key (letters and digits, camelCase) made from a label, unique among `taken`. */
export function keyFromLabel(label: string, taken: ReadonlySet<string>): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('');
  if (!base || !/^[a-z]/.test(base)) base = `c${base}`;
  base = base.slice(0, 40);
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}${n}`;
  return key;
}

/** Options of a select column: trimmed, no empties and no repeats. */
export function cleanOptions(options: readonly string[]): string[] {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))];
}

/**
 * The key of each draft: existing ones keep theirs; new ones get one from their label that is
 * unique among every key the list ever had (`reserved`) and among the other drafts, so a deleted
 * column's hidden data is never picked up by a new column.
 */
function assignKeys(
  drafts: readonly { key?: string; label: string }[],
  reserved: readonly string[],
): string[] {
  const taken = new Set([...reserved, ...drafts.flatMap((d) => (d.key ? [d.key] : []))]);
  return drafts.map((draft) => {
    if (draft.key) return draft.key;
    const key = keyFromLabel(draft.label, taken);
    taken.add(key);
    return key;
  });
}

/** The fields to save, with the key rules of `assignKeys`. */
export function buildFieldDefs(
  drafts: readonly DraftField[],
  reserved: readonly string[],
): FieldDef[] {
  const keys = assignKeys(drafts, reserved);
  return drafts.map((draft, i) => {
    const options = cleanOptions(draft.options);
    return {
      key: keys[i]!,
      label: draft.label.trim(),
      type: draft.type,
      ...(draft.type === 'select' && options.length > 0 && { options }),
    };
  });
}

/** The board columns to save, with the same key rules as `buildFieldDefs`. */
export function buildColumns(
  drafts: readonly DraftColumn[],
  reserved: readonly string[],
): BoardColumn[] {
  const keys = assignKeys(drafts, reserved);
  return drafts.map((draft, i) => ({
    key: keys[i]!,
    label: draft.label.trim(),
    ...(draft.color && { color: draft.color }),
    ...(draft.icon && { icon: draft.icon }),
  }));
}

/** A table: the columns the user defined, as the fields of a free list. */
export function tableList(name: string, fields: readonly DraftField[], alias: string): CreateList {
  return {
    name: name.trim(),
    kind: 'free',
    icon: 'table',
    ...(alias && { captureAlias: alias }),
    fieldDefs: buildFieldDefs(
      fields.filter((field) => field.label.trim()),
      [],
    ),
  };
}

/** A board: its columns in order, each with its colour. */
export function boardList(
  name: string,
  columns: readonly DraftColumn[],
  alias: string,
): CreateList {
  return {
    name: name.trim(),
    kind: 'board',
    icon: 'kanban',
    ...(alias && { captureAlias: alias }),
    fieldDefs: [],
    board: {
      columns: buildColumns(
        columns.filter((column) => column.label.trim()),
        [],
      ),
    },
  };
}

/** A simple list: only titles to tick off. */
export function simpleList(name: string, alias: string): CreateList {
  return {
    name: name.trim(),
    kind: 'free',
    icon: 'list',
    ...(alias && { captureAlias: alias }),
    fieldDefs: [],
  };
}

/** What a list is called on the lists screen. */
export function listTypeLabel(list: {
  kind: string;
  board?: { columns: readonly unknown[] } | undefined;
  fieldDefs: readonly unknown[];
}): string {
  if (list.board) return `Kanban · ${list.board.columns.length} columnas`;
  if (list.kind === 'free') {
    return list.fieldDefs.length > 0 ? `Tabla · ${list.fieldDefs.length} columnas` : 'Lista simple';
  }
  return { media: 'Colección', shopping: 'Compras' }[list.kind] ?? 'Lista';
}
