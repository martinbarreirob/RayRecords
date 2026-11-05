/**
 * Conversión entre el texto de los campos de fecha y hora (`YYYY-MM-DD` y `HH:mm`, el mismo valor que
 * da un `<input type="date|time">`) y los objetos que usa el selector de escritorio. Funciones puras
 * y sin Zod. Todo con componentes **locales**: nunca se pasa por UTC (`toISOString` desplazaría el
 * día cerca de la medianoche).
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `'2026-11-04'` → `Date` local a medianoche; `null` si el texto está vacío o no es una fecha real. */
export function parseIsoDate(text: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text ?? '').trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `new Date(2026, 1, 31)` salta a marzo: se rechaza lo que no sobrevive al viaje de vuelta.
  date.setFullYear(year);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** `Date` → `'YYYY-MM-DD'` con los componentes locales; `''` si no hay fecha. */
export function toIsoDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hora completa válida (`HH:mm`) o `null`. */
export function parseTime(
  text: string | null | undefined,
): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec((text ?? '').trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** `{ hours, minutes }` → `'HH:mm'`. */
export function formatTime(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Lo que escribe el usuario → `'HH:mm'`. Acepta `930`, `9:30`, `09.30`, `9h30`, `17` (= 17:00) y
 * `0930`. Devuelve `''` para el texto vacío y `null` si no es una hora válida.
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

/** Suma minutos a una hora (da la vuelta a las 24 h); si no hay hora válida parte de `fallback`. */
export function shiftTime(value: string, deltaMinutes: number, fallback = '09:00'): string {
  const parts = parseTime(value) ?? parseTime(fallback) ?? { hours: 9, minutes: 0 };
  const total = parts.hours * 60 + parts.minutes + deltaMinutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return formatTime(Math.floor(wrapped / 60), wrapped % 60);
}

/** Muestra una fecha `YYYY-MM-DD` como `dd/mm/aaaa`; el texto que no sea una fecha se devuelve igual. */
export function displayDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : iso;
}
