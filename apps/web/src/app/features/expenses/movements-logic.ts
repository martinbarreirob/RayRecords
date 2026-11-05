import { TRANSFER_CATEGORY, type Transaction } from '@rayrecords/shared';

/** A section of the design: a category, or `null` for uncategorised movements. */
export type SectionKey = string | null;

/** Active section in the table: all, only uncategorised, or one category. */
export type SectionFilter = 'all' | 'none' | (string & {});

/** Period in `YYYY-MM` months; `null` at one end means no limit on that side. */
export interface Period {
  from: string | null;
  to: string | null;
}

/** Movement with names already resolved, so sorting and filtering need no lookups. */
export interface MovementRow extends Transaction {
  categoryName: string;
}

export interface SectionTotal {
  key: SectionKey;
  totalCents: number;
  count: number;
}

export interface PeriodTotals {
  expensesCents: number;
  incomeCents: number;
  balanceCents: number;
}

/** Lowercase and accent-free, so "cafe" finds "Café". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function sumCents(rows: readonly { amountCents: number }[]): number {
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}

/** `true` if the month is inside the period (ends included). */
export function inPeriod(month: string, period: Period): boolean {
  if (period.from && month < period.from) return false;
  if (period.to && month > period.to) return false;
  return true;
}

/** Total and movement count per category, plus a `null` entry if any are uncategorised. */
export function sectionTotals(rows: readonly Transaction[]): Map<SectionKey, SectionTotal> {
  const result = new Map<SectionKey, SectionTotal>();
  for (const row of rows) {
    const current = result.get(row.category) ?? { key: row.category, totalCents: 0, count: 0 };
    current.totalCents += row.amountCents;
    current.count += 1;
    result.set(row.category, current);
  }
  return result;
}

/**
 * Expenses, income and balance for the period. Transfers between own accounts are ignored,
 * as in the API monthly summary.
 */
export function periodTotals(rows: readonly Transaction[]): PeriodTotals {
  let expensesCents = 0;
  let incomeCents = 0;
  for (const row of rows) {
    if (row.category === TRANSFER_CATEGORY) continue;
    if (row.amountCents < 0) expensesCents += row.amountCents;
    else incomeCents += row.amountCents;
  }
  return { expensesCents, incomeCents, balanceCents: expensesCents + incomeCents };
}

/** Filters by active section and by text (description, ignoring accents and case). */
export function filterMovements<T extends MovementRow>(
  rows: readonly T[],
  section: SectionFilter,
  query: string,
): T[] {
  const needle = normalizeText(query);
  return rows.filter((row) => {
    if (section === 'none' && row.category !== null) return false;
    if (section !== 'all' && section !== 'none' && row.category !== section) return false;
    return needle === '' || normalizeText(row.description).includes(needle);
  });
}

/** `YYYY-MM` month of a local `Date`. */
export function monthOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First day of the `YYYY-MM` month as a local `Date`. */
export function dateOfMonth(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year!, monthNumber! - 1, 1);
}

/** How many months the period spans (1 for a single month; `null` if it lacks either end). */
export function periodSpan(period: Period): number | null {
  if (!period.from || !period.to) return null;
  const [fromYear, fromMonth] = period.from.split('-').map(Number);
  const [toYear, toMonth] = period.to.split('-').map(Number);
  return (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!) + 1;
}

/** Single month that can be sent to the API as `month`; `null` if the period is a range or open. */
export function singleMonth(period: Period): string | null {
  return period.from !== null && period.from === period.to ? period.from : null;
}

/** Sort options on mobile, where the table headers are hidden. */
export interface SortChoice {
  id: string;
  label: string;
  field: 'date' | 'description' | 'amountCents' | 'categoryName';
  order: 1 | -1;
}

export const SORT_CHOICES: SortChoice[] = [
  { id: 'date-desc', label: 'Más recientes', field: 'date', order: -1 },
  { id: 'date-asc', label: 'Más antiguos', field: 'date', order: 1 },
  { id: 'amount-asc', label: 'Mayor gasto', field: 'amountCents', order: 1 },
  { id: 'amount-desc', label: 'Mayor ingreso', field: 'amountCents', order: -1 },
  { id: 'description-asc', label: 'Descripción A–Z', field: 'description', order: 1 },
];

const MONTH_LONG = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });
const DAY_SHORT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const DAY_SHORT_YEAR = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Period label: "noviembre de 2026", "oct 2026 – dic 2026" or "Todo el histórico". */
export function periodLabel(period: Period): string {
  if (!period.from && !period.to) return 'Todo el histórico';
  const from = period.from ?? period.to!;
  const to = period.to ?? period.from!;
  if (from === to) return MONTH_LONG.format(dateOfMonth(from));
  return `${MONTH_SHORT.format(dateOfMonth(from))} – ${MONTH_SHORT.format(dateOfMonth(to))}`;
}

/** "28 oct" (with the year if not the current one) from `YYYY-MM-DD`. */
export function formatDay(date: string, currentYear: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year!, month! - 1, day!);
  return (year === currentYear ? DAY_SHORT : DAY_SHORT_YEAR).format(value).replace(/\./g, '');
}
