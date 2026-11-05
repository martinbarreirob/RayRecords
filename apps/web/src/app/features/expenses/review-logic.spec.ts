import type { Category, ReviewGroup } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import {
  groupTitle,
  matchCategories,
  mergeGroups,
  newCategoryFromQuery,
  orderByUsage,
  progressPercent,
  sourceLabel,
  shortcutLabel,
  suggestionIndex,
} from './review-logic';

const categories: Category[] = [
  { key: 'cafeteria', name: 'Cafetería' },
  { key: 'restaurantes', name: 'Restaurantes' },
  { key: 'ropa', name: 'Ropa' },
  { key: 'compras-online', name: 'Compras online' },
];

const group = (ids: string[], merchantKey: string | null = 'x'): ReviewGroup => ({
  merchantKey,
  ids,
  count: ids.length,
  totalCents: -100,
  minCents: -100,
  maxCents: -100,
  sampleDescription: 'X',
  firstDate: '2026-01-01',
  lastDate: '2026-01-02',
  recentCents: [],
  suggestions: [],
});

describe('review-logic', () => {
  it('suggestionIndex: 1-9 are the first nine and 0 the tenth', () => {
    expect(suggestionIndex('1')).toBe(0);
    expect(suggestionIndex('4')).toBe(3);
    expect(suggestionIndex('0')).toBe(9);
    expect(shortcutLabel(9)).toBe('0');
    expect(shortcutLabel(0)).toBe('1');
    expect(shortcutLabel(10)).toBeNull();
    expect(suggestionIndex('a')).toBeNull();
    expect(suggestionIndex('10')).toBeNull();
  });

  it('matchCategories ignores accents and ranks prefix matches first', () => {
    expect(matchCategories(categories, 'cafe').map((c) => c.key)).toEqual(['cafeteria']);
    expect(
      matchCategories(categories, 'r')
        .map((c) => c.key)
        .slice(0, 2),
    ).toEqual(['restaurantes', 'ropa']);
    expect(matchCategories(categories, 'online').map((c) => c.key)).toEqual(['compras-online']);
    expect(matchCategories(categories, '  ')).toEqual([]);
  });

  it('groupTitle uses the merchant or, if missing, the concept without the town', () => {
    expect(groupTitle({ merchantKey: 'acme town 1', sampleDescription: 'ACME' })).toBe(
      'Acme town 1',
    );
    expect(groupTitle({ merchantKey: null, sampleDescription: 'regalo panchuki' })).toBe(
      'Regalo panchuki',
    );
  });

  it('sourceLabel agrees in singular and plural', () => {
    expect(sourceLabel({ category: 'a', source: 'history', count: 1 })).toContain('1 vez');
    expect(sourceLabel({ category: 'a', source: 'history', count: 5 })).toContain('5 veces');
  });

  it('progressPercent clamps and does not divide by zero', () => {
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(20, 10)).toBe(100);
  });

  it('mergeGroups does not repeat groups already loaded', () => {
    const merged = mergeGroups([group(['a', 'b'])], [group(['b']), group(['c'])]);
    expect(merged.map((g) => g.ids)).toEqual([['a', 'b'], ['c']]);
  });

  it('newCategoryFromQuery proposes a name and key, and skips existing ones', () => {
    expect(newCategoryFromQuery('  mascotas ', categories)).toEqual({
      key: 'mascotas',
      name: 'Mascotas',
    });
    expect(newCategoryFromQuery('Ocio y cultura', categories)?.key).toBe('ocio_y_cultura');
    expect(newCategoryFromQuery('cafetería', categories)).toBeNull(); // already exists (accent-insensitive)
    expect(newCategoryFromQuery('ropa', categories)).toBeNull();
    expect(newCategoryFromQuery('  ', categories)).toBeNull();
    expect(newCategoryFromQuery('!!!', categories)).toBeNull();
  });

  it('orderByUsage sorts by usage, keeps Otros last and breaks ties by series order', () => {
    const list: Category[] = [
      { key: 'otros', name: 'Otros' },
      { key: 'ocio', name: 'Ocio' },
      { key: 'coche', name: 'Coche' },
      { key: 'zumos', name: 'Zumos' },
      { key: 'hogar', name: 'Hogar' },
    ];
    const usage = [
      { category: 'otros', count: 99 },
      { category: 'zumos', count: 7 },
      { category: 'ocio', count: 3 },
    ];
    expect(orderByUsage(list, usage).map((c) => c.key)).toEqual([
      'zumos',
      'ocio',
      'coche',
      'hogar',
      'otros',
    ]);
  });
});
