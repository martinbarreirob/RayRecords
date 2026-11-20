import type { CalendarEvent } from '@rayrecords/shared';
import { normalizeText } from '../../core/text';

const key = (event: CalendarEvent): string => event.date + (event.time ?? '');

/**
 * The events in the order they are read: what is still to come (today on) soonest first, then
 * what has passed, the most recent first. The input order does not matter.
 */
export function sortEvents(events: readonly CalendarEvent[], today: string): CalendarEvent[] {
  const upcoming = events.filter((event) => event.date >= today);
  const past = events.filter((event) => event.date < today);
  const byKey = (a: CalendarEvent, b: CalendarEvent) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  return [...upcoming.sort(byKey), ...past.sort((a, b) => byKey(b, a))];
}

/** The events whose title contains the text (case and accents ignored). */
export function filterEvents(events: readonly CalendarEvent[], query: string): CalendarEvent[] {
  const needle = normalizeText(query);
  return needle === ''
    ? [...events]
    : events.filter((event) => normalizeText(event.title).includes(needle));
}

/** "3 eventos", "1 evento". */
export function eventsCountText(count: number): string {
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}
