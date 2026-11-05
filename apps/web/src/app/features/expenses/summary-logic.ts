import type { MonthlyCategoryTotal } from '@rayrecords/shared';
import { shiftMonth } from '../calendar/calendar-grid';

/** Tope de columnas (meses) que admite el resumen. */
export const MAX_SUMMARY_MONTHS = 24;

export interface SummaryRow {
  category: string | null;
  byMonth: Record<string, number>;
  totalCents: number;
  count: number;
}

export interface SummaryModel {
  months: string[];
  /** Una fila por categoría, de mayor a menor importe absoluto. */
  rows: SummaryRow[];
  monthTotals: Record<string, number>;
  grandTotalCents: number;
  /** Media por mes del periodo completo (los meses sin movimientos cuentan como 0). */
  monthlyAverageCents: number;
}

/** Meses `YYYY-MM` de `from` a `to`, ambos incluidos, con un tope de `max` columnas. */
export function monthsInRange(from: string, to: string, max = MAX_SUMMARY_MONTHS): string[] {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < max; month = shiftMonth(month, 1)) {
    months.push(month);
  }
  return months;
}

/** Recorta un rango para que no pase del tope de meses (se conserva el inicio). */
export function clampRange(from: string, to: string, max = MAX_SUMMARY_MONTHS): [string, string] {
  const months = monthsInRange(from, to, max);
  return [from, months[months.length - 1] ?? from];
}

/** Agrupa las filas (categoría × mes) de la API en una tabla con totales. */
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

/** Porcentaje (0–100) de `part` sobre `total`, 0 si el total es 0. */
export function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((Math.abs(part) / Math.abs(total)) * 100);
}
