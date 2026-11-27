import type { Dashboard, SalesTotals, StockCategory } from '@rayrecords/shared';
import { NO_CATEGORY } from '../stock/stock-logic';

export const PERIODS: readonly { days: number; label: string }[] = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

/** `YYYY-MM-DD` as a local date at noon, so no time zone can move it to another day. */
function dateOf(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!, 12);
}

const DAY_SHORT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const DAY_LONG = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "18 nov" */
export function shortDay(day: string): string {
  return DAY_SHORT.format(dateOf(day)).replace(/\./g, '');
}

/** "miércoles, 18 de noviembre" */
export function longDay(day: string): string {
  return DAY_LONG.format(dateOf(day));
}

/**
 * Change against the period before, as a whole percentage. `null` when there is nothing to
 * compare with (no sales before): a percentage over zero would say nothing.
 */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "+12 % frente a los 30 días anteriores", or what to say when there is no earlier data. */
export function changeLabel(current: number, previous: number, days: number): string {
  const change = changePercent(current, previous);
  if (change === null) return current === 0 ? 'Sin ventas todavía' : 'Sin datos anteriores';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${Math.abs(change)} % frente a los ${days} días anteriores`;
}

/** What the sales left once the units were paid for. */
export function profitOf(totals: SalesTotals): number {
  return totals.totalCents - totals.costCents;
}

/** Profit as a whole percentage of the sales; `null` when nothing was sold. */
export function marginPercent(totals: SalesTotals): number | null {
  return totals.totalCents === 0 ? null : Math.round((profitOf(totals) / totals.totalCents) * 100);
}

/** Average ticket, or 0 when there are no tickets. */
export function averageTicket(totals: SalesTotals): number {
  return totals.tickets === 0 ? 0 : Math.round(totals.totalCents / totals.tickets);
}

/** A bar of the daily chart: its height as a percentage of the best day. */
export interface DayBar {
  date: string;
  totalCents: number;
  tickets: number;
  units: number;
  /** 0–100; a day with sales never drops below a visible sliver. */
  height: number;
}

const MIN_BAR = 2;

export function dayBars(days: Dashboard['days']): DayBar[] {
  const max = Math.max(0, ...days.map((day) => day.totalCents));
  return days.map((day) => ({
    ...day,
    height:
      max === 0 || day.totalCents === 0
        ? 0
        : Math.max(MIN_BAR, Math.round((day.totalCents / max) * 100)),
  }));
}

/** The best day of the period, or `null` when nothing was sold. */
export function bestDay(days: Dashboard['days']): Dashboard['days'][number] | null {
  const best = days.reduce((top, day) => (day.totalCents > top.totalCents ? day : top), days[0]!);
  return best && best.totalCents > 0 ? best : null;
}

/** Dates under the daily chart: the first, the middle one and the last. */
export function axisDays(days: Dashboard['days']): string[] {
  if (days.length === 0) return [];
  const picks = [0, Math.floor((days.length - 1) / 2), days.length - 1];
  return [...new Set(picks)].map((index) => shortDay(days[index]!.date));
}

/** A row of a horizontal bar list: the width is relative to the largest row. */
export interface RankRow {
  id: string;
  label: string;
  value: number;
  /** 0–100 */
  width: number;
  category?: StockCategory;
}

function ranked<T extends { id: string; label: string; value: number; category?: StockCategory }>(
  rows: T[],
): RankRow[] {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return rows.map((row) => ({
    ...row,
    width: max === 0 ? 0 : Math.max(MIN_BAR, Math.round((row.value / max) * 100)),
  }));
}

/** The best sellers, each with its category for the badge (none when it has none or it is gone). */
export function productRows(
  top: Dashboard['topProducts'],
  categories: readonly StockCategory[] = [],
): RankRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return ranked(
    top.map((p) => {
      const category = p.categoryId ? byId.get(p.categoryId) : undefined;
      return { id: p.productId, label: p.name, value: p.units, ...(category && { category }) };
    }),
  );
}

/** Sales by category, with the category itself for its badge; unknown ids read as none. */
export function categoryRows(
  sales: Dashboard['categories'],
  categories: readonly StockCategory[],
): RankRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const merged = new Map<string, { label: string; value: number; category?: StockCategory }>();
  for (const row of sales) {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    const id = category?.id ?? 'none';
    const current = merged.get(id) ?? {
      label: category?.name ?? NO_CATEGORY,
      value: 0,
      ...(category && { category }),
    };
    current.value += row.totalCents;
    merged.set(id, current);
  }
  return ranked([...merged].map(([id, row]) => ({ id, ...row })).sort((a, b) => b.value - a.value));
}

/** A slice of the stock bar: how many products are in that state and their share. */
export interface StockSlice {
  id: 'ok' | 'low' | 'out';
  label: string;
  count: number;
  /** 0–100 */
  share: number;
}

export function stockSlices(stock: Dashboard['stock']): StockSlice[] {
  const total = stock.products;
  const slice = (id: StockSlice['id'], label: string, count: number): StockSlice => ({
    id,
    label,
    count,
    share: total === 0 ? 0 : (count / total) * 100,
  });
  return [
    slice('ok', 'Con stock', stock.ok),
    slice('low', 'Stock bajo', stock.low),
    slice('out', 'Agotado', stock.out),
  ];
}
