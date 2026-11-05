import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';
import { assignOccurrences, transactionHash } from './hash';
import { normalizeDescription } from './normalize';

describe('normalizeDescription', () => {
  it('lowercases, strips accents and collapses whitespace', () => {
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

  it('applies the first matching rule', () => {
    const rules = [rule('mercadona', 'supermercado'), rule('netflix', 'suscripciones')];
    expect(categorize(normalizeDescription('COMPRA TARJ. MERCADONA MADRID'), rules)).toBe(
      'supermercado',
    );
    expect(categorize(normalizeDescription('RECIBO NETFLIX.COM'), rules)).toBe('suscripciones');
  });

  it('returns null when no rule matches', () => {
    expect(categorize('bizum recibido juan', [rule('mercadona', 'supermercado')])).toBeNull();
  });

  it('respects priority and, on equal priority, order', () => {
    const rules = [
      rule('amazon', 'ocio'),
      rule('amazon prime', 'suscripciones', { priority: 5 }),
      rule('amazon', 'otros'),
    ];
    expect(categorize('amazon prime video', rules)).toBe('suscripciones');
    expect(categorize('amazon marketplace', rules)).toBe('ocio');
  });

  it('ignores inactive rules', () => {
    expect(categorize('netflix', [rule('netflix', 'suscripciones', { active: false })])).toBeNull();
  });

  it('compares patterns ignoring accents and case', () => {
    expect(categorize('farmacia garcia', [rule('Farmacia GARCÍA', 'salud')])).toBe('salud');
  });

  it('supports startsWith and regex', () => {
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

  it('an invalid regex does not break categorization', () => {
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

  it('is deterministic', () => {
    expect(transactionHash(base)).toBe(transactionHash({ ...base }));
    expect(transactionHash(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['the date', { date: '2026-10-06' }],
    ['the amount', { amountCents: -1300 }],
    ['the description', { descriptionNorm: 'recibo spotify' }],
    ['the account', { accountId: '6650a1b2c3d4e5f607182931' }],
    ['the occurrence', { occurrence: 1 }],
    ['the balance after', { balanceAfterCents: 100_000 }],
  ])('changes when %s changes', (_label, change) => {
    expect(transactionHash({ ...base, ...change })).not.toBe(transactionHash(base));
  });

  it('does not confuse adjacent fields', () => {
    const a = transactionHash({ ...base, descriptionNorm: 'x|1', occurrence: 0 });
    const b = transactionHash({ ...base, descriptionNorm: 'x', occurrence: 0 });
    expect(a).not.toBe(b);
  });
});

describe('assignOccurrences', () => {
  it('numbers identical transactions in order of appearance', () => {
    expect(assignOccurrences(['a', 'b', 'a', 'a', 'b', 'c'])).toEqual([0, 0, 1, 2, 1, 0]);
  });

  it('an overlapping statement produces the same numbers for the shared part', () => {
    const march = ['cafe', 'cafe', 'pan'];
    const marchPlus = ['cafe', 'cafe', 'pan', 'cafe']; // the second statement extends further
    expect(assignOccurrences(marchPlus).slice(0, 3)).toEqual(assignOccurrences(march));
  });
});
