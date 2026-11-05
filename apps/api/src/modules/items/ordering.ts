/** Separación entre elementos al asignar orden de cero y tras renumerar. */
export const ORDER_STEP = 1000;
/** Por debajo de este hueco entre vecinos ya no se puede subdividir con fiabilidad: hay que renumerar. */
const MIN_GAP = 1e-3;

/**
 * Orden para colocar un elemento entre `prev` y `next` (vecinos ya ordenados; `undefined` = extremo).
 * Devuelve `null` si no queda hueco suficiente y la columna debe renumerarse antes.
 */
export function orderBetween(prev: number | undefined, next: number | undefined): number | null {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return next! - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  if (next - prev < MIN_GAP * 2) return null;
  return (prev + next) / 2;
}

/** Órdenes nuevos y equiespaciados para `count` elementos (renumeración). */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}
