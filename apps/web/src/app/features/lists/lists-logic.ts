/** Same rule as `CaptureAlias` in shared (copied here to keep Zod out of the web bundle). */
const ALIAS = /^[a-z][a-z0-9]{1,19}$/;

/** Text typed in the alias field → lowercase without spaces (`Peli ` → `peli`). */
export function cleanAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/** Why a capture alias is not valid (empty is valid: the list has no alias). */
export function aliasError(alias: string): string | null {
  if (alias === '' || ALIAS.test(alias)) return null;
  if (!/^[a-z]/.test(alias)) return 'Debe empezar por una letra';
  if (alias.length < 2) return 'Necesita al menos 2 caracteres';
  if (alias.length > 20) return 'Máximo 20 caracteres';
  return 'Solo letras sin tilde y números, sin espacios';
}

/**
 * Order of lists. Same idea as the Kanban (`apps/api/src/modules/items/ordering.ts`, copied here
 * to avoid depending on the API): the moved list takes the midpoint between its new neighbours and
 * everything is renumbered only when the gap runs out.
 */

/** Spacing between lists when renumbering and when placing a list at an end. */
export const ORDER_STEP = 1000;
/** Below this gap between neighbours, subdividing is no longer reliable. */
const MIN_GAP = 1e-3;

/** The minimum needed from a list to order it. */
export interface Orderable {
  id: string;
  order: number;
}

/**
 * Order to place something between `prev` and `next` (already sorted neighbours; `undefined` = end).
 * Returns `null` if there is not enough gap and a renumber is needed.
 */
export function orderBetween(prev: number | undefined, next: number | undefined): number | null {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return next! - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  if (next - prev < MIN_GAP * 2) return null;
  return (prev + next) / 2;
}

/** New evenly spaced orders for `count` lists (renumbering). */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}

/** Result of moving a list: how the set ends up and which `order` values must be saved in the API. */
export interface ReorderPlan<T extends Orderable> {
  /** The lists in their new order, with `order` updated. */
  lists: T[];
  /** `order` changes to send: normally one; several if renumbering was needed. */
  patches: { id: string; order: number }[];
}

/**
 * Moves list `id` to position `toIndex` (the one it will have at the end, 0-based; clamped to the
 * range). `lists` must be sorted by `order`. `null` if the list does not exist or does not move.
 */
export function planReorder<T extends Orderable>(
  lists: readonly T[],
  id: string,
  toIndex: number,
): ReorderPlan<T> | null {
  const from = lists.findIndex((l) => l.id === id);
  if (from === -1) return null;
  const to = Math.max(0, Math.min(Math.trunc(toIndex), lists.length - 1));
  if (to === from) return null;

  const moved = lists[from]!;
  const rest = lists.filter((l) => l.id !== id);
  const order = orderBetween(rest[to - 1]?.order, rest[to]?.order);

  if (order !== null) {
    const next = [...rest.slice(0, to), { ...moved, order }, ...rest.slice(to)];
    return { lists: next, patches: [{ id, order }] };
  }

  // No gap: renumber all and send only those that really change.
  const sequence = [...rest.slice(0, to), moved, ...rest.slice(to)];
  const orders = renumber(sequence.length);
  const next = sequence.map((l, i) => ({ ...l, order: orders[i]! }));
  const before = new Map(lists.map((l) => [l.id, l.order]));
  const patches = next
    .filter((l) => before.get(l.id) !== l.order)
    .map((l) => ({ id: l.id, order: l.order }));
  return { lists: next, patches };
}

/** Final position when moving a list up (-1) or down (+1) one place; `null` if already at the end. */
export function stepIndex(
  lists: readonly Orderable[],
  id: string,
  direction: -1 | 1,
): number | null {
  const index = lists.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const target = index + direction;
  return target < 0 || target >= lists.length ? null : target;
}

/** Copy of the lists sorted by `order` (stable: ties keep their place). */
export function sortByOrder<T extends Orderable>(lists: readonly T[]): T[] {
  return [...lists].sort((a, b) => a.order - b.order);
}

/** Screen-reader message after moving a list: «Películas movida a la posición 2 de 6». */
export function movedMessage(name: string, index: number, total: number): string {
  return `${name} movida a la posición ${index + 1} de ${total}`;
}
