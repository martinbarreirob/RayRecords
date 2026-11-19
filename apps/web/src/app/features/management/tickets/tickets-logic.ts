import { DEFAULT_TIME_ZONE, addDays, type Ticket } from '@rayrecords/shared';
import { normalizeText } from '../../../core/text';

/** How many tickets the screen asks for (the API's maximum): the newest ones. */
export const TICKETS_LIMIT = 200;

/** A ticket with what the list shows already worked out. */
export interface TicketRow extends Ticket {
  /** Units over every line. */
  units: number;
  /** "18 nov 2026, 10:32" */
  when: string;
}

/** "18 nov 2026, 10:32" in the app's time zone (or the one given). */
export function formatTicketDate(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
    .format(new Date(iso))
    .replace(/\./g, '');
}

export function toTicketRows(tickets: readonly Ticket[], timeZone?: string): TicketRow[] {
  return tickets.map((ticket) => ({
    ...ticket,
    units: ticket.lines.reduce((sum, line) => sum + line.quantity, 0),
    when: formatTicketDate(ticket.createdAt, timeZone),
  }));
}

/**
 * Search by ticket number ("12" or "#12" finds number 12 and 112) or by a product on it,
 * ignoring accents and case.
 */
export function filterTickets<T extends Ticket>(tickets: readonly T[], query: string): T[] {
  const needle = normalizeText(query).replace(/^#\s*/, '');
  if (needle === '') return [...tickets];
  return tickets.filter(
    (ticket) =>
      String(ticket.number).includes(needle) ||
      ticket.lines.some((line) => normalizeText(line.name).includes(needle)),
  );
}

export function ticketsTotal(tickets: readonly Ticket[]): number {
  return tickets.reduce((sum, ticket) => sum + ticket.totalCents, 0);
}

/** Days to show, both included, as `YYYY-MM-DD`; an empty end has no limit on that side. */
export interface DateRange {
  from: string;
  to: string;
}

export const ALL_DATES: DateRange = { from: '', to: '' };

export type RangePreset = 'all' | 'today' | '7d' | '30d' | 'month';

export const RANGE_PRESETS: readonly { id: RangePreset; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
];

/** The range of a shortcut; "7 días" is today and the six days before it. */
export function presetRange(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case 'all':
      return ALL_DATES;
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** The shortcut a range matches, if any (so its button shows as pressed). */
export function presetOf(range: DateRange, today: string): RangePreset | null {
  return (
    RANGE_PRESETS.find(({ id }) => {
      const preset = presetRange(id, today);
      return preset.from === range.from && preset.to === range.to;
    })?.id ?? null
  );
}

/** A range typed backwards is read the right way round. */
export function orderedRange(range: DateRange): DateRange {
  return range.from && range.to && range.from > range.to
    ? { from: range.to, to: range.from }
    : range;
}

export function isRangeActive(range: DateRange): boolean {
  return range.from !== '' || range.to !== '';
}

/** "3 unidades", "1 unidad". */
export function unitsLabel(units: number): string {
  return units === 1 ? '1 unidad' : `${units} unidades`;
}
