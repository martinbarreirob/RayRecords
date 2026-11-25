import { monthTitle, shiftMonth } from '../calendar/calendar-grid';
import type { Period } from './movements-logic';

export interface PeriodPreset {
  id: string;
  label: string;
  period: Period;
}

/** Period shortcuts from the current month (`YYYY-MM`). `all` only if the screen allows no limit. */
export function periodPresets(currentMonth: string, allowAll: boolean): PeriodPreset[] {
  const year = currentMonth.slice(0, 4);
  const lastYear = String(Number(year) - 1);
  const presets: PeriodPreset[] = [
    { id: 'this-month', label: 'Este mes', period: { from: currentMonth, to: currentMonth } },
    {
      id: 'last-month',
      label: 'Mes anterior',
      period: { from: shiftMonth(currentMonth, -1), to: shiftMonth(currentMonth, -1) },
    },
    {
      id: 'last-3',
      label: 'Últimos 3 meses',
      period: { from: shiftMonth(currentMonth, -2), to: currentMonth },
    },
    {
      id: 'last-12',
      label: 'Últimos 12 meses',
      period: { from: shiftMonth(currentMonth, -11), to: currentMonth },
    },
    { id: 'this-year', label: year, period: yearPeriod(year) },
    { id: 'last-year', label: lastYear, period: yearPeriod(lastYear) },
  ];
  if (allowAll) presets.push({ id: 'all', label: 'Todo', period: { from: null, to: null } });
  return presets;
}

/** Shortcuts for the single-month picker: this month and its neighbours. */
export function singleMonthPresets(currentMonth: string): PeriodPreset[] {
  const month = (id: string, label: string, delta: number): PeriodPreset => {
    const target = shiftMonth(currentMonth, delta);
    return { id, label, period: { from: target, to: target } };
  };
  return [
    month('this-month', 'Este mes', 0),
    month('last-month', 'Mes anterior', -1),
    month('next-month', 'Mes siguiente', 1),
  ];
}

/** `2026-11` to `noviembre 2026`. */
export function singleMonthLabel(month: string): string {
  return monthTitle(month).replace(' de ', ' ').toLowerCase();
}

/** January to December of the year. */
export function yearPeriod(year: string): Period {
  return { from: `${year}-01`, to: `${year}-12` };
}

/** The year if the period is exactly one full calendar year, otherwise `null`. */
export function wholeYear(period: Period): string | null {
  const { from, to } = period;
  if (!from || !to) return null;
  const year = from.slice(0, 4);
  return from === `${year}-01` && to === `${year}-12` ? year : null;
}

/** Period between two months, in either order. */
export function rangeBetween(a: string, b: string): Period {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** Whether the month is inside the period. An open period includes every month. */
export function monthInPeriod(month: string, period: Period): boolean {
  return (!period.from || month >= period.from) && (!period.to || month <= period.to);
}
