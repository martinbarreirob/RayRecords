import { describe, expect, it } from 'vitest';
import { addDays, isValidDateOnly, monthOf, todayIn } from './dates';

describe('isValidDateOnly', () => {
  it('acepta fechas reales, incluido el 29 de febrero bisiesto', () => {
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
  it('usa la zona horaria pedida, no UTC', () => {
    const now = new Date('2026-11-03T23:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-03');
    expect(todayIn('Europe/Madrid', now)).toBe('2026-11-04');
  });
});

describe('addDays', () => {
  it('cruza fin de mes, fin de año y años bisiestos', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('admite desplazamientos negativos y cero', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });
});

describe('monthOf', () => {
  it('extrae YYYY-MM', () => {
    expect(monthOf('2026-11-03')).toBe('2026-11');
  });
});
