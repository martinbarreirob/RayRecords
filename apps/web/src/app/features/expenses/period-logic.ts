import { shiftMonth } from '../calendar/calendar-grid';
import { periodSpan, type Period } from './movements-logic';

export interface PeriodPreset {
  id: string;
  label: string;
  period: Period;
}

/** Atajos de periodo a partir del mes actual (`YYYY-MM`). `all` solo si la pantalla admite «sin límite». */
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

/** Enero a diciembre del año. */
export function yearPeriod(year: string): Period {
  return { from: `${year}-01`, to: `${year}-12` };
}

/** El año si el periodo es exactamente un año natural completo; si no, `null`. */
export function wholeYear(period: Period): string | null {
  const { from, to } = period;
  if (!from || !to) return null;
  const year = from.slice(0, 4);
  return from === `${year}-01` && to === `${year}-12` ? year : null;
}

/** Periodo entre dos meses en cualquier orden. */
export function rangeBetween(a: string, b: string): Period {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** ¿Está el mes dentro del periodo? Un periodo abierto (sin límites) los incluye todos. */
export function monthInPeriod(month: string, period: Period): boolean {
  return (!period.from || month >= period.from) && (!period.to || month <= period.to);
}

/**
 * Periodo anterior (`-1`) o siguiente (`1`) del mismo tamaño: un año entero salta de año en año y el resto
 * de rangos avanza tantos meses como abarque. `null` si el periodo no tiene los dos extremos.
 */
export function shiftPeriod(period: Period, direction: -1 | 1): Period | null {
  const { from, to } = period;
  if (!from || !to) return null;
  const span = wholeYear(period) ? 12 : (periodSpan({ from, to }) ?? 1);
  return { from: shiftMonth(from, direction * span), to: shiftMonth(to, direction * span) };
}
