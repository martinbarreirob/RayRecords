import { describe, expect, it } from 'vitest';
import { addDays, isValidDateOnly, monthOf, startOfDayIn, todayIn } from './dates';

describe('isValidDateOnly', () => {
  it('accepts real dates, including 29 February in a leap year', () => {
    expect(isValidDateOnly('2026-11-03')).toBe(true);
    expect(isValidDateOnly('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', 'hoy', ''])(
    'rechaza "%s"',
    (value) => {
      expect(isValidDateOnly(value)).toBe(false);
    },
  );
});

describe('todayIn', () => {
  it('uses the requested time zone, not UTC', () => {
    const now = new Date('2026-11-03T23:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-03');
    expect(todayIn('Europe/Madrid', now)).toBe('2026-11-04');
  });
});

describe('addDays', () => {
  it('crosses month ends, year ends and leap years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('accepts negative and zero offsets', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });
});

describe('monthOf', () => {
  it('extracts YYYY-MM', () => {
    expect(monthOf('2026-11-03')).toBe('2026-11');
  });
});

describe('startOfDayIn', () => {
  it('gives the instant the day starts in the zone, in winter and in summer time', () => {
    expect(startOfDayIn('2026-11-18', 'Europe/Madrid').toISOString()).toBe(
      '2026-11-17T23:00:00.000Z',
    );
    expect(startOfDayIn('2026-07-01', 'Europe/Madrid').toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });

  it('is right on the days the clocks change', () => {
    expect(startOfDayIn('2026-03-29', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(startOfDayIn('2026-03-30', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
    expect(startOfDayIn('2026-10-25', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
    expect(startOfDayIn('2026-10-26', 'Europe/Madrid').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
  });

  it('is midnight UTC in UTC and works west of it', () => {
    expect(startOfDayIn('2026-11-18', 'UTC').toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(startOfDayIn('2026-11-18', 'America/New_York').toISOString()).toBe(
      '2026-11-18T05:00:00.000Z',
    );
  });
});
