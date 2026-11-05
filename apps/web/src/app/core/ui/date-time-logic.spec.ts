import { describe, expect, it } from 'vitest';
import {
  displayDate,
  formatTime,
  normalizeTime,
  parseIsoDate,
  parseTime,
  shiftTime,
  toIsoDate,
} from './date-time-logic';

describe('parseIsoDate / toIsoDate', () => {
  it('converts a day to a local Date and back without moving the day', () => {
    const date = parseIsoDate('2026-11-04');
    expect(date).not.toBeNull();
    expect([date!.getFullYear(), date!.getMonth(), date!.getDate()]).toEqual([2026, 10, 4]);
    expect([date!.getHours(), date!.getMinutes()]).toEqual([0, 0]);
    expect(toIsoDate(date)).toBe('2026-11-04');
  });

  it('the round trip is stable at year boundaries and in leap years', () => {
    for (const text of ['2026-01-01', '2026-12-31', '2028-02-29', '2000-02-29', '0099-03-05']) {
      expect(toIsoDate(parseIsoDate(text))).toBe(text);
    }
  });

  it('does not go through UTC: at 23:59 local it is still the same day', () => {
    expect(toIsoDate(new Date(2026, 5, 30, 23, 59, 59))).toBe('2026-06-30');
    expect(toIsoDate(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });

  it('rejects what is not a real date', () => {
    for (const text of [
      '',
      '2026-02-30',
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '04/11/2026',
      'x',
    ]) {
      expect(parseIsoDate(text)).toBeNull();
    }
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });

  it('toIsoDate returns empty for no date or an invalid date', () => {
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(new Date('no es una fecha'))).toBe('');
  });
});

describe('displayDate', () => {
  it('formats dd/mm/aaaa and leaves non-dates untouched', () => {
    expect(displayDate('2026-11-04')).toBe('04/11/2026');
    expect(displayDate('')).toBe('');
    expect(displayDate('mañana')).toBe('mañana');
  });
});

describe('normalizeTime', () => {
  it('accepts the usual ways of typing a time', () => {
    expect(normalizeTime('09:30')).toBe('09:30');
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('930')).toBe('09:30');
    expect(normalizeTime('0930')).toBe('09:30');
    expect(normalizeTime('09.30')).toBe('09:30');
    expect(normalizeTime('9h30')).toBe('09:30');
    expect(normalizeTime('17')).toBe('17:00');
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime(' 23:59 ')).toBe('23:59');
    expect(normalizeTime('00:00')).toBe('00:00');
  });

  it('empty text is valid (no time) and the impossible is null', () => {
    expect(normalizeTime('')).toBe('');
    expect(normalizeTime('   ')).toBe('');
    expect(normalizeTime(undefined)).toBe('');
    for (const text of ['24:00', '25', '12:60', '9:5', '1:2:3', 'abc', '123456', '-1']) {
      expect(normalizeTime(text)).toBeNull();
    }
  });
});

describe('parseTime / formatTime', () => {
  it('reads and writes HH:mm', () => {
    expect(parseTime('07:05')).toEqual({ hours: 7, minutes: 5 });
    expect(parseTime('7:05')).toBeNull();
    expect(parseTime('24:00')).toBeNull();
    expect(formatTime(7, 5)).toBe('07:05');
  });
});

describe('shiftTime', () => {
  it('adds and subtracts minutes', () => {
    expect(shiftTime('09:00', 15)).toBe('09:15');
    expect(shiftTime('09:00', -15)).toBe('08:45');
    expect(shiftTime('09:30', 60)).toBe('10:30');
  });

  it('wraps at midnight', () => {
    expect(shiftTime('23:50', 15)).toBe('00:05');
    expect(shiftTime('00:05', -15)).toBe('23:50');
    expect(shiftTime('00:00', -1440)).toBe('00:00');
  });

  it('with no starting time it uses the fallback', () => {
    expect(shiftTime('', 0)).toBe('09:00');
    expect(shiftTime('', 15)).toBe('09:15');
    expect(shiftTime('mal', 0, '12:00')).toBe('12:00');
  });
});
