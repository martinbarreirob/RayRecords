import type { BoardColumn, FieldDef, Item, List } from '@rayrecords/shared';
import type { DraftColumn, DraftField } from './create-logic';

/** Limits of the list schema (see `ListSchema` in shared). */
export const MAX_COLUMNS = 12;
export const MAX_FIELDS = 30;

/** Whether the list has something to configure: a board or a table (fields). */
export function isConfigurable(list: Pick<List, 'board' | 'fieldDefs'>): boolean {
  return !!list.board || list.fieldDefs.length > 0;
}

export function fieldsToDrafts(defs: readonly FieldDef[], firstId = 1): DraftField[] {
  return defs.map((def, i) => ({
    id: firstId + i,
    key: def.key,
    label: def.label,
    type: def.type,
    options: [...(def.options ?? [])],
  }));
}

export function columnsToDrafts(columns: readonly BoardColumn[], firstId = 1): DraftColumn[] {
  return columns.map((column, i) => ({
    id: firstId + i,
    key: column.key,
    label: column.label,
    ...(column.color && { color: column.color }),
    ...(column.icon && { icon: column.icon }),
  }));
}

/** Cards per column key. */
export function cardsPerColumn(items: readonly Pick<Item, 'column'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.column) counts.set(item.column, (counts.get(item.column) ?? 0) + 1);
  }
  return counts;
}

/**
 * Why a board column cannot be deleted, or `null` when it can. The API does not check this when a
 * list is saved, so the screen has to: cards in a deleted column would be orphaned.
 */
export function columnDeleteBlock(
  column: DraftColumn,
  counts: ReadonlyMap<string, number>,
  total: number,
): string | null {
  if (total <= 1) return 'Un tablero necesita al menos una columna';
  if (!column.key) return null;
  const n = counts.get(column.key) ?? 0;
  if (n === 0) return null;
  return n === 1
    ? 'Tiene 1 tarjeta: muévela a otra columna antes de borrarla'
    : `Tiene ${n} tarjetas: muévelas a otra columna antes de borrarla`;
}

/** What the dialog checks before saving; `null` when everything is fine. */
export function settingsProblem(
  name: string,
  rows: readonly { label: string }[],
  what: 'column' | 'field',
): string | null {
  if (!name.trim()) return 'La lista necesita un nombre';
  if (rows.length === 0) return 'Necesita al menos una columna';
  if (rows.some((row) => !row.label.trim())) return 'Todas las columnas necesitan un nombre';
  const labels = rows.map((row) => row.label.trim().toLowerCase());
  if (what === 'field' && new Set(labels).size !== labels.length) {
    return 'Dos columnas se llaman igual';
  }
  return null;
}
