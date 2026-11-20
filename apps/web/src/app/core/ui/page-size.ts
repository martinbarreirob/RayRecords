/** Rows a page shows when the screen cannot be measured (a phone, where the page scrolls). */
export const DEFAULT_PAGE_SIZE = 20;
/** Fewest rows a page shows, so a small window still has a table worth looking at. */
export const MIN_PAGE_SIZE = 10;

/**
 * How many rows fit in `available` pixels when each is `rowHeight` tall. Never less than
 * `MIN_PAGE_SIZE`: on a short window the page scrolls rather than the table shrinking away.
 */
export function fitPageSize(available: number, rowHeight: number): number {
  if (!(rowHeight > 0) || !(available > 0)) return DEFAULT_PAGE_SIZE;
  return Math.max(MIN_PAGE_SIZE, Math.floor(available / rowHeight));
}
