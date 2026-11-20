import type { CalendarEvent } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import { eventsCountText, filterEvents, sortEvents } from './events-logic';

const event = (title: string, date: string, time?: string): CalendarEvent => ({
  id: title.padEnd(24, '0'),
  title,
  date,
  ...(time && { time }),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('sortEvents', () => {
  it('puts what is to come first, soonest first, then the past, most recent first', () => {
    const sorted = sortEvents(
      [
        event('viejo', '2026-10-01'),
        event('tarde', '2026-11-20', '18:00'),
        event('lejano', '2026-12-25'),
        event('ayer', '2026-11-19'),
        event('mañana', '2026-11-20', '09:00'),
      ],
      '2026-11-20',
    );
    expect(sorted.map((e) => e.title)).toEqual(['mañana', 'tarde', 'lejano', 'ayer', 'viejo']);
  });
});

describe('filterEvents', () => {
  it('ignores case and accents, and keeps everything for an empty query', () => {
    const events = [event('Cumpleaños de Ana', '2026-11-20'), event('Dentista', '2026-11-21')];
    expect(filterEvents(events, 'CUMPLEANOS').map((e) => e.title)).toEqual(['Cumpleaños de Ana']);
    expect(filterEvents(events, '  ')).toHaveLength(2);
  });
});

describe('eventsCountText', () => {
  it('uses the singular for one', () => {
    expect(eventsCountText(1)).toBe('1 evento');
    expect(eventsCountText(0)).toBe('0 eventos');
  });
});
