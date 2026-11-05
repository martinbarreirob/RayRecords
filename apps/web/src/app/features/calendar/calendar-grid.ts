import { addDays } from '@rayrecords/shared';

export interface GridDay {
  date: string;
  inMonth: boolean;
}

/** `YYYY-MM` desplazado `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Cuadrícula mensual por semanas, empezando en lunes; incluye los días de los meses vecinos. */
export function buildMonthGrid(month: string): GridDay[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const start = addDays(first, -offset);
  const weeks = Math.ceil((offset + daysInMonth) / 7);

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      return { date, inMonth: date.startsWith(month) };
    }),
  );
}

/** Elementos agrupados por su `dueDate` (los que no la tienen se ignoran). */
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

/** Orden dentro de un día: primero los que no tienen hora, luego por hora y por título. */
export function sortDayEntries<T extends { time?: string | undefined; title: string }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? 1 : -1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.title.localeCompare(b.title, 'es');
  });
}

/** Parte visible de un día de la cuadrícula: hasta `max` elementos y cuántos quedan ocultos. */
export function splitVisible<T>(entries: readonly T[], max: number): { shown: T[]; more: number } {
  // Si solo sobra uno, se muestra: «+1 más» ocuparía el mismo sitio que el propio elemento.
  if (entries.length <= max + 1) return { shown: [...entries], more: 0 };
  return { shown: entries.slice(0, max), more: entries.length - max };
}

/** Vencido: sin hacer y con fecha anterior a hoy. */
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

/** `2026-11` → `Noviembre de 2026`. */
export function monthTitle(month: string): string {
  return capitalize(
    new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      utcDate(`${month}-01`),
    ),
  );
}

/** `2026-11-04` → `Miércoles, 4 de noviembre`. */
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

/** Piezas de una fecha para la agenda: día de la semana abreviado y número del día. */
export function dayParts(date: string): { weekday: string; day: string } {
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' })
    .format(utcDate(date))
    .replace('.', '');
  return { weekday: capitalize(weekday), day: String(Number(date.slice(8))) };
}

/** Día que se selecciona al cambiar de mes: hoy si es ese mes; si no, el día 1. */
export function defaultSelection(month: string, today: string): string {
  return today.startsWith(month) ? today : `${month}-01`;
}

/** Día al que lleva una tecla de navegación dentro de la rejilla (semanas de lunes a domingo). */
export function arrowTarget(date: string, key: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lunes = 0
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

/** Clave del rango de fechas que pide el calendario para un mes (primer y último día de la rejilla). */
export function rangeKey(weeks: readonly (readonly GridDay[])[]): string {
  return `${weeks[0]![0]!.date}..${weeks.at(-1)!.at(-1)!.date}`;
}

/** Anchos (en %) de las «píldoras» fantasma de la celda número `index`: 0, 1 o 2, sin azar para no saltar. */
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
