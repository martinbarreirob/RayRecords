import type { MonthlyCategoryTotal } from '@rayrecords/shared';
import { shiftMonth } from '../calendar/calendar-grid';

/** Maximum number of columns (months) the summary supports. */
export const MAX_SUMMARY_MONTHS = 24;

export interface SummaryRow {
  category: string | null;
  byMonth: Record<string, number>;
  totalCents: number;
  count: number;
}

export interface SummaryModel {
  months: string[];
  /** One row per category, from largest to smallest absolute amount. */
  rows: SummaryRow[];
  monthTotals: Record<string, number>;
  grandTotalCents: number;
  /** Monthly average over the whole period (months without movements count as 0). */
  monthlyAverageCents: number;
}

/** `YYYY-MM` months from `from` to `to`, both included, capped at `max` columns. */
export function monthsInRange(from: string, to: string, max = MAX_SUMMARY_MONTHS): string[] {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < max; month = shiftMonth(month, 1)) {
    months.push(month);
  }
  return months;
}

/** Trims a range to the month cap, keeping its start. */
export function clampRange(from: string, to: string, max = MAX_SUMMARY_MONTHS): [string, string] {
  const months = monthsInRange(from, to, max);
  return [from, months[months.length - 1] ?? from];
}

/** Groups the API rows (category by month) into a table with totals. */
export function buildSummary(
  data: readonly MonthlyCategoryTotal[],
  months: readonly string[],
): SummaryModel {
  const byCategory = new Map<string | null, SummaryRow>();
  const monthTotals: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  let grandTotalCents = 0;

  for (const item of data) {
    const row = byCategory.get(item.category) ?? {
      category: item.category,
      byMonth: {},
      totalCents: 0,
      count: 0,
    };
    row.byMonth[item.month] = (row.byMonth[item.month] ?? 0) + item.totalCents;
    row.totalCents += item.totalCents;
    row.count += item.count;
    byCategory.set(item.category, row);
    monthTotals[item.month] = (monthTotals[item.month] ?? 0) + item.totalCents;
    grandTotalCents += item.totalCents;
  }

  const rows = [...byCategory.values()].sort(
    (a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents),
  );
  return {
    months: [...months],
    rows,
    monthTotals,
    grandTotalCents,
    monthlyAverageCents: months.length ? Math.round(grandTotalCents / months.length) : 0,
  };
}

/** Percentage (0-100) of `part` over `total`; 0 if the total is 0. */
export function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((Math.abs(part) / Math.abs(total)) * 100);
}
