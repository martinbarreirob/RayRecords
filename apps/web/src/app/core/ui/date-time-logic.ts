/**
 * Conversion between the text of the date and time fields (`YYYY-MM-DD` and `HH:mm`, the same value
 * an `<input type="date|time">` gives) and the objects the desktop picker uses. Pure functions,
 * no Zod. Everything uses **local** components: never through UTC (`toISOString` would shift the
 * day near midnight).
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `'2026-11-04'` to a local `Date` at midnight; `null` if the text is empty or not a real date. */
export function parseIsoDate(text: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text ?? '').trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `new Date(2026, 1, 31)` rolls over to March: anything that does not survive the round trip is rejected.
  date.setFullYear(year);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** `Date` to `'YYYY-MM-DD'` using local components; `''` if there is no date. */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Valid full time (`HH:mm`) or `null`. */
export function parseTime(
  text: string | null | undefined,
): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec((text ?? '').trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** `{ hours, minutes }` to `'HH:mm'`. */
export function formatTime(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * What the user types to `'HH:mm'`. Accepts `930`, `9:30`, `09.30`, `9h30`, `17` (= 17:00) and
 * `0930`. Returns `''` for empty text and `null` if it is not a valid time.
 */
export function normalizeTime(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  if (value === '') return '';
  const match = /^(\d{1,2})(?:[:.hH]?(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return formatTime(hours, minutes);
}

/** Adds minutes to a time (wraps at 24 h); if there is no valid time it starts from `fallback`. */
export function shiftTime(value: string, deltaMinutes: number, fallback = '09:00'): string {
  const parts = parseTime(value) ?? parseTime(fallback) ?? { hours: 9, minutes: 0 };
  const total = parts.hours * 60 + parts.minutes + deltaMinutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return formatTime(Math.floor(wrapped / 60), wrapped % 60);
}

/** Shows a `YYYY-MM-DD` date as `dd/mm/aaaa`; text that is not a date is returned unchanged. */
export function displayDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : iso;
}
