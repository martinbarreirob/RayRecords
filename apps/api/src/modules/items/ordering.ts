/** Spacing between items when assigning order from scratch and after renumbering. */
export const ORDER_STEP = 1000;
/** Below this gap between neighbours it can no longer be split reliably: renumber instead. */
const MIN_GAP = 1e-3;

/**
 * Order for placing an item between `prev` and `next` (sorted neighbours; `undefined` = edge).
 * Returns `null` when there is not enough gap and the column must be renumbered first.
 */
export function orderBetween(prev: number | undefined, next: number | undefined): number | null {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return next! - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  if (next - prev < MIN_GAP * 2) return null;
  return (prev + next) / 2;
}

/** New evenly spaced orders for `count` items (renumbering). */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}
