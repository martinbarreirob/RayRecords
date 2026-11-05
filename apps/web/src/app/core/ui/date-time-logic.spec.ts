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
  it('convierte un día a Date local y de vuelta sin mover el día', () => {
    const date = parseIsoDate('2026-11-04');
    expect(date).not.toBeNull();
    expect([date!.getFullYear(), date!.getMonth(), date!.getDate()]).toEqual([2026, 10, 4]);
    expect([date!.getHours(), date!.getMinutes()]).toEqual([0, 0]);
    expect(toIsoDate(date)).toBe('2026-11-04');
  });

  it('el viaje de ida y vuelta es estable en los extremos del año y en bisiestos', () => {
    for (const text of ['2026-01-01', '2026-12-31', '2028-02-29', '2000-02-29', '0099-03-05']) {
      expect(toIsoDate(parseIsoDate(text))).toBe(text);
    }
  });

  it('no pasa por UTC: a las 23:59 locales sigue siendo el mismo día', () => {
    expect(toIsoDate(new Date(2026, 5, 30, 23, 59, 59))).toBe('2026-06-30');
    expect(toIsoDate(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });

  it('rechaza lo que no es una fecha real', () => {
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

  it('toIsoDate devuelve vacío sin fecha o con una fecha inválida', () => {
    expect(toIsoDate(null)).toBe('');
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(new Date('no es una fecha'))).toBe('');
  });
});

describe('displayDate', () => {
  it('formatea dd/mm/aaaa y deja intacto lo que no es fecha', () => {
    expect(displayDate('2026-11-04')).toBe('04/11/2026');
    expect(displayDate('')).toBe('');
    expect(displayDate('mañana')).toBe('mañana');
  });
});

describe('normalizeTime', () => {
  it('acepta las formas habituales de escribir una hora', () => {
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

  it('el texto vacío es válido (sin hora) y lo imposible es null', () => {
    expect(normalizeTime('')).toBe('');
    expect(normalizeTime('   ')).toBe('');
    expect(normalizeTime(undefined)).toBe('');
    for (const text of ['24:00', '25', '12:60', '9:5', '1:2:3', 'abc', '123456', '-1']) {
      expect(normalizeTime(text)).toBeNull();
    }
  });
});

describe('parseTime / formatTime', () => {
  it('lee y escribe HH:mm', () => {
    expect(parseTime('07:05')).toEqual({ hours: 7, minutes: 5 });
    expect(parseTime('7:05')).toBeNull();
    expect(parseTime('24:00')).toBeNull();
    expect(formatTime(7, 5)).toBe('07:05');
  });
});

describe('shiftTime', () => {
  it('suma y resta minutos', () => {
    expect(shiftTime('09:00', 15)).toBe('09:15');
    expect(shiftTime('09:00', -15)).toBe('08:45');
    expect(shiftTime('09:30', 60)).toBe('10:30');
  });

  it('da la vuelta al llegar a medianoche', () => {
    expect(shiftTime('23:50', 15)).toBe('00:05');
    expect(shiftTime('00:05', -15)).toBe('23:50');
    expect(shiftTime('00:00', -1440)).toBe('00:00');
  });

  it('sin hora de partida usa la de referencia', () => {
    expect(shiftTime('', 0)).toBe('09:00');
    expect(shiftTime('', 15)).toBe('09:15');
    expect(shiftTime('mal', 0, '12:00')).toBe('12:00');
  });
});
