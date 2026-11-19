import type { Ticket } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import {
  filterTickets,
  formatTicketDate,
  isRangeActive,
  orderedRange,
  presetOf,
  presetRange,
  ticketsTotal,
  toTicketRows,
  unitsLabel,
} from './tickets-logic';

function ticket(number: number, lines: [string, number, number][], createdAt: string): Ticket {
  return {
    id: String(number).padStart(24, '0'),
    number,
    lines: lines.map(([name, quantity, unitPriceCents], index) => ({
      productId: String(index).padStart(24, 'a'),
      name,
      quantity,
      unitPriceCents,
    })),
    totalCents: lines.reduce((sum, [, quantity, price]) => sum + quantity * price, 0),
    createdAt,
  };
}

const tickets = [
  ticket(112, [['Café molido', 2, 350]], '2026-11-18T09:32:00.000Z'),
  ticket(12, [['Agua', 6, 60]], '2026-11-17T16:05:00.000Z'),
  ticket(
    3,
    [
      ['Patatas', 1, 150],
      ['Agua', 2, 60],
    ],
    '2026-07-01T22:30:00.000Z',
  ),
];

describe('formatTicketDate', () => {
  it('shows day, month, year and time in the app time zone', () => {
    expect(formatTicketDate('2026-11-18T09:32:00.000Z')).toBe('18 nov 2026, 10:32');
  });

  it('uses the local day, not the UTC one', () => {
    expect(formatTicketDate('2026-07-01T22:30:00.000Z')).toBe('2 jul 2026, 00:30');
    expect(formatTicketDate('2026-07-01T22:30:00.000Z', 'UTC')).toBe('1 jul 2026, 22:30');
  });
});

describe('toTicketRows', () => {
  it('adds up the units and formats the date', () => {
    const rows = toTicketRows(tickets);
    expect(rows.map((row) => row.units)).toEqual([2, 6, 3]);
    expect(rows[0]?.when).toBe('18 nov 2026, 10:32');
  });
});

describe('filterTickets', () => {
  const numbers = (query: string) => filterTickets(tickets, query).map((t) => t.number);

  it('returns everything for an empty search', () => {
    expect(numbers('  ')).toEqual([112, 12, 3]);
  });

  it('finds by number, with or without the hash', () => {
    expect(numbers('12')).toEqual([112, 12]);
    expect(numbers('#3')).toEqual([3]);
  });

  it('finds by a product on the ticket, ignoring accents and case', () => {
    expect(numbers('CAFE')).toEqual([112]);
    expect(numbers('agua')).toEqual([12, 3]);
  });

  it('finds nothing when nothing matches', () => {
    expect(numbers('zumo')).toEqual([]);
  });
});

describe('date ranges', () => {
  const TODAY = '2026-11-19';

  it('turns each shortcut into its days, today included', () => {
    expect(presetRange('all', TODAY)).toEqual({ from: '', to: '' });
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange('7d', TODAY)).toEqual({ from: '2026-11-13', to: TODAY });
    expect(presetRange('30d', TODAY)).toEqual({ from: '2026-10-21', to: TODAY });
    expect(presetRange('month', TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
  });

  it('recognises the shortcut a range matches', () => {
    expect(presetOf({ from: '', to: '' }, TODAY)).toBe('all');
    expect(presetOf({ from: '2026-11-13', to: TODAY }, TODAY)).toBe('7d');
    expect(presetOf({ from: '2026-11-10', to: '2026-11-12' }, TODAY)).toBeNull();
  });

  it('reads a range typed backwards the right way round', () => {
    expect(orderedRange({ from: '2026-11-12', to: '2026-11-10' })).toEqual({
      from: '2026-11-10',
      to: '2026-11-12',
    });
    expect(orderedRange({ from: '2026-11-12', to: '' })).toEqual({ from: '2026-11-12', to: '' });
  });

  it('knows whether any date is set', () => {
    expect(isRangeActive({ from: '', to: '' })).toBe(false);
    expect(isRangeActive({ from: '', to: TODAY })).toBe(true);
  });
});

describe('totals and labels', () => {
  it('adds up the tickets', () => {
    expect(ticketsTotal(tickets)).toBe(700 + 360 + 270);
    expect(ticketsTotal([])).toBe(0);
  });

  it('says unit or units', () => {
    expect(unitsLabel(1)).toBe('1 unidad');
    expect(unitsLabel(4)).toBe('4 unidades');
  });
});
