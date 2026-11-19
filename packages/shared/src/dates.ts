/**
 * Calendar dates (no time) as `YYYY-MM-DD` strings.
 * `Date` is avoided for anything that is not a real instant, so time zones cannot shift a day.
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

/** Today's date in the given time zone (not the device's or the server's). */
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

/** Adds calendar days; unaffected by daylight saving changes. */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** What the clocks of a time zone show at an instant, read as if it were UTC. */
function wallClock(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

/**
 * The instant a calendar day starts in a time zone (`2026-11-18` in Madrid is
 * `2026-11-17T23:00:00Z`). For day ranges over real instants: from the start of the first day
 * up to, not including, the start of the day after the last.
 */
export function startOfDayIn(date: DateOnly, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  let instant = target;
  // Two passes: the second corrects a first guess that fell on the other side of a clock change.
  for (let pass = 0; pass < 2; pass++) instant -= wallClock(instant, timeZone) - target;
  return new Date(instant);
}

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function monthOf(date: DateOnly): string {
  return date.slice(0, 7);
}
