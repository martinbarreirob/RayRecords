import { addDays } from '@rayrecords/shared';

export interface GridDay {
  date: string;
  inMonth: boolean;
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Monthly grid by weeks, starting on Monday; includes the days of the neighboring months. */
export function buildMonthGrid(month: string): GridDay[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -offset);
  const weeks = Math.ceil((offset + daysInMonth) / 7);

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      return { date, inMonth: date.startsWith(month) };
    }),
  );
}

/** Items grouped by their `dueDate` (those without one are ignored). */
export function groupByDate<T extends { dueDate?: string | undefined }>(
  entries: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    if (!entry.dueDate) continue;
    const group = groups.get(entry.dueDate);
    if (group) group.push(entry);
    else groups.set(entry.dueDate, [entry]);
  }
  return groups;
}

/** Order within a day: items without a time first, then by time and title. */
export function sortDayEntries<T extends { time?: string | undefined; title: string }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? 1 : -1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.title.localeCompare(b.title, 'es');
  });
}

/** Visible part of a grid day: up to `max` items and how many are hidden. */
export function splitVisible<T>(entries: readonly T[], max: number): { shown: T[]; more: number } {
  // If only one is left it is shown: "+1 más" would take the same space as the item itself.
  if (entries.length <= max + 1) return { shown: [...entries], more: 0 };
  return { shown: entries.slice(0, max), more: entries.length - max };
}

/** Overdue: not done and with a date before today. */
export function isOverdueEntry(
  entry: { doneAt?: string | undefined; dueDate?: string | undefined },
  today: string,
): boolean {
  return !entry.doneAt && !!entry.dueDate && entry.dueDate < today;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function utcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** `2026-11` to `Noviembre de 2026`. */
export function monthTitle(month: string): string {
  return capitalize(
    new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      utcDate(`${month}-01`),
    ),
  );
}

/** `2026-11-04` to `Miércoles, 4 de noviembre`. */
export function dayTitle(date: string): string {
  return capitalize(
    new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(utcDate(date)),
  );
}

/** Pieces of a date for the agenda: abbreviated weekday and day number. */
export function dayParts(date: string): { weekday: string; day: string } {
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' })
    .format(utcDate(date))
    .replace('.', '');
  return { weekday: capitalize(weekday), day: String(Number(date.slice(8))) };
}

/** Day selected when changing month: today if it is that month; otherwise day 1. */
export function defaultSelection(month: string, today: string): string {
  return today.startsWith(month) ? today : `${month}-01`;
}

/** Day a navigation key leads to inside the grid (weeks from Monday to Sunday). */
export function arrowTarget(date: string, key: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1);
    case 'ArrowRight':
      return addDays(date, 1);
    case 'ArrowUp':
      return addDays(date, -7);
    case 'ArrowDown':
      return addDays(date, 7);
    case 'Home':
      return addDays(date, -weekday);
    case 'End':
      return addDays(date, 6 - weekday);
    default:
      return date;
  }
}

/** Key of the date range the calendar requests for a month (first and last day of the grid). */
export function rangeKey(weeks: readonly (readonly GridDay[])[]): string {
  return `${weeks[0]![0]!.date}..${weeks.at(-1)!.at(-1)!.date}`;
}

/** Widths (in %) of the ghost pills of cell number `index`: 0, 1 or 2, no randomness so nothing jumps. */
const GHOST_PILLS: readonly (readonly number[])[] = [
  [],
  [82],
  [],
  [64, 90],
  [],
  [],
  [74],
  [],
  [58, 80],
  [],
  [88],
];

export function ghostPills(index: number): readonly number[] {
  return GHOST_PILLS[index % GHOST_PILLS.length]!;
}
