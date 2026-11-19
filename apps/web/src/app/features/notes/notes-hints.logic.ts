/** A run of consecutive hints shown together: `from` inclusive, `to` exclusive. */
export interface HintPage {
  from: number;
  to: number;
}

/**
 * Splits the hints into pages of whole hints that fit in `available` pixels, with `gap` between
 * neighbours. A hint wider than the space still gets a page of its own. With nothing measured yet
 * (no width available) everything goes on a single page.
 */
export function paginateHints(
  widths: readonly number[],
  gap: number,
  available: number,
): HintPage[] {
  if (widths.length === 0) return [];
  if (available <= 0) return [{ from: 0, to: widths.length }];

  const pages: HintPage[] = [];
  let from = 0;
  while (from < widths.length) {
    let to = from + 1;
    let used = widths[from]!;
    while (to < widths.length && used + gap + widths[to]! <= available) {
      used += gap + widths[to]!;
      to += 1;
    }
    pages.push({ from, to });
    from = to;
  }
  return pages;
}
