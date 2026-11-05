import { TRANSFER_CATEGORY, type Transaction } from '@rayrecords/shared';

/** Una «sección» del diseño: una categoría (o `null` para los movimientos sin categoría). */
export type SectionKey = string | null;

/** Qué sección está activa en la tabla: todas, solo las sin categoría o una categoría concreta. */
export type SectionFilter = 'all' | 'none' | (string & {});

/** Periodo en meses `YYYY-MM`; `null` en un extremo = sin límite por ese lado. */
export interface Period {
  from: string | null;
  to: string | null;
}

/** Movimiento con los nombres ya resueltos, para ordenar y filtrar sin volver a buscarlos. */
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

/** Minúsculas y sin acentos, para que «cafe» encuentre «Café». */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function sumCents(rows: readonly { amountCents: number }[]): number {
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}

/** `true` si el mes está dentro del periodo (extremos incluidos). */
export function inPeriod(month: string, period: Period): boolean {
  if (period.from && month < period.from) return false;
  if (period.to && month > period.to) return false;
  return true;
}

/** Total y número de movimientos por categoría, más una entrada `null` si hay alguno sin categoría. */
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
 * Gastos, ingresos y balance del periodo. Los traspasos entre cuentas propias no cuentan
 * (igual que en el resumen mensual de la API).
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

/** Filtra por sección activa y por texto (descripción, sin acentos ni mayúsculas). */
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

/** Meses `YYYY-MM` de un `Date` local. */
export function monthOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Primer día del mes `YYYY-MM` como `Date` local. */
export function dateOfMonth(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year!, monthNumber! - 1, 1);
}

/** Cuántos meses abarca el periodo (1 si es un solo mes; `null` si no tiene los dos extremos). */
export function periodSpan(period: Period): number | null {
  if (!period.from || !period.to) return null;
  const [fromYear, fromMonth] = period.from.split('-').map(Number);
  const [toYear, toMonth] = period.to.split('-').map(Number);
  return (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!) + 1;
}

/** Mes concreto que se puede pedir a la API con `month`; `null` si el periodo es un rango o está abierto. */
export function singleMonth(period: Period): string | null {
  return period.from !== null && period.from === period.to ? period.from : null;
}

/** Ordenaciones disponibles en móvil, donde las cabeceras de la tabla no se ven. */
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

/** «noviembre de 2026», «oct 2026 – dic 2026» o «Todo el histórico». */
export function periodLabel(period: Period): string {
  if (!period.from && !period.to) return 'Todo el histórico';
  const from = period.from ?? period.to!;
  const to = period.to ?? period.from!;
  if (from === to) return MONTH_LONG.format(dateOfMonth(from));
  return `${MONTH_SHORT.format(dateOfMonth(from))} – ${MONTH_SHORT.format(dateOfMonth(to))}`;
}

/** «28 oct» (con el año si no es el actual) a partir de `YYYY-MM-DD`. */
export function formatDay(date: string, currentYear: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year!, month! - 1, day!);
  return (year === currentYear ? DAY_SHORT : DAY_SHORT_YEAR).format(value).replace(/\./g, '');
}
