/**
 * Fechas "de calendario" (sin hora) como cadenas `YYYY-MM-DD`.
 * Se evita `Date` para todo lo que no sea un instante real: así no hay desfases por zona horaria.
 */
export type DateOnly = string;

export const DEFAULT_TIME_ZONE = 'Europe/Madrid';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Fecha de hoy en la zona horaria indicada (no la del dispositivo ni la del servidor). */
export function todayIn(timeZone: string, now: Date = new Date()): DateOnly {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Suma días de calendario; no depende de cambios de hora (DST). */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function monthOf(date: DateOnly): string {
  return date.slice(0, 7);
}
