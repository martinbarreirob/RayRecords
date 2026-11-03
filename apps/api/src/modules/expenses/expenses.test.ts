import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';
import { assignOccurrences, transactionHash } from './hash';
import { normalizeDescription } from './normalize';

describe('normalizeDescription', () => {
  it('pasa a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizeDescription('  FARMACIA   GARCÍA  ')).toBe('farmacia garcia');
  });
});

describe('categorize', () => {
  const rule = (
    pattern: string,
    categoryKey: string,
    extra: Partial<Parameters<typeof categorize>[1][number]> = {},
  ) => ({
    pattern,
    matchType: 'contains' as const,
    categoryKey,
    priority: 0,
    active: true,
    ...extra,
  });

  it('aplica la primera regla que coincide', () => {
    const rules = [rule('mercadona', 'supermercado'), rule('netflix', 'suscripciones')];
    expect(categorize(normalizeDescription('COMPRA TARJ. MERCADONA MADRID'), rules)).toBe(
      'supermercado',
    );
    expect(categorize(normalizeDescription('RECIBO NETFLIX.COM'), rules)).toBe('suscripciones');
  });

  it('devuelve null si ninguna regla coincide', () => {
    expect(categorize('bizum recibido juan', [rule('mercadona', 'supermercado')])).toBeNull();
  });

  it('respeta la prioridad y, a igual prioridad, el orden', () => {
    const rules = [
      rule('amazon', 'ocio'),
      rule('amazon prime', 'suscripciones', { priority: 5 }),
      rule('amazon', 'otros'),
    ];
    expect(categorize('amazon prime video', rules)).toBe('suscripciones');
    expect(categorize('amazon marketplace', rules)).toBe('ocio');
  });

  it('ignora las reglas inactivas', () => {
    expect(categorize('netflix', [rule('netflix', 'suscripciones', { active: false })])).toBeNull();
  });

  it('compara patrones sin acentos ni mayúsculas', () => {
    expect(categorize('farmacia garcia', [rule('Farmacia GARCÍA', 'salud')])).toBe('salud');
  });

  it('soporta startsWith y regex', () => {
    const rules = [
      {
        pattern: 'transferencia',
        matchType: 'startsWith' as const,
        categoryKey: 'otros',
        priority: 0,
        active: true,
      },
      {
        pattern: '^dia\\b',
        matchType: 'regex' as const,
        categoryKey: 'supermercado',
        priority: 0,
        active: true,
      },
    ];
    expect(categorize('transferencia a juan', rules)).toBe('otros');
    expect(categorize('pago transferencia', rules)).toBeNull();
    expect(categorize('dia 1234 madrid', rules)).toBe('supermercado');
    expect(categorize('diario de viaje', rules)).toBeNull();
  });

  it('una regex inválida no rompe la categorización', () => {
    const rules = [
      {
        pattern: '(',
        matchType: 'regex' as const,
        categoryKey: 'otros',
        priority: 9,
        active: true,
      },
      rule('netflix', 'suscripciones'),
    ];
    expect(categorize('netflix', rules)).toBe('suscripciones');
  });
});

describe('transactionHash', () => {
  const base = {
    accountId: '6650a1b2c3d4e5f607182930',
    date: '2026-10-05',
    amountCents: -1299,
    descriptionNorm: 'recibo netflix.com',
    occurrence: 0,
  };

  it('es determinista', () => {
    expect(transactionHash(base)).toBe(transactionHash({ ...base }));
    expect(transactionHash(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['la fecha', { date: '2026-10-06' }],
    ['el importe', { amountCents: -1300 }],
    ['la descripción', { descriptionNorm: 'recibo spotify' }],
    ['la cuenta', { accountId: '6650a1b2c3d4e5f607182931' }],
    ['la repetición', { occurrence: 1 }],
    ['el saldo posterior', { balanceAfterCents: 100_000 }],
  ])('cambia si cambia %s', (_label, change) => {
    expect(transactionHash({ ...base, ...change })).not.toBe(transactionHash(base));
  });

  it('no confunde campos contiguos', () => {
    const a = transactionHash({ ...base, descriptionNorm: 'x|1', occurrence: 0 });
    const b = transactionHash({ ...base, descriptionNorm: 'x', occurrence: 0 });
    expect(a).not.toBe(b);
  });
});

describe('assignOccurrences', () => {
  it('numera los movimientos idénticos en orden de aparición', () => {
    expect(assignOccurrences(['a', 'b', 'a', 'a', 'b', 'c'])).toEqual([0, 0, 1, 2, 1, 0]);
  });

  it('un extracto solapado produce los mismos números para el tramo común', () => {
    const march = ['cafe', 'cafe', 'pan'];
    const marchPlus = ['cafe', 'cafe', 'pan', 'cafe']; // el segundo extracto llega más allá
    expect(assignOccurrences(marchPlus).slice(0, 3)).toEqual(assignOccurrences(march));
  });
});
