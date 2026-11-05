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
  it('suggestionIndex: 1-9 son las nueve primeras y 0 la décima', () => {
    expect(suggestionIndex('1')).toBe(0);
    expect(suggestionIndex('4')).toBe(3);
    expect(suggestionIndex('0')).toBe(9);
    expect(shortcutLabel(9)).toBe('0');
    expect(shortcutLabel(0)).toBe('1');
    expect(shortcutLabel(10)).toBeNull();
    expect(suggestionIndex('a')).toBeNull();
    expect(suggestionIndex('10')).toBeNull();
  });

  it('matchCategories ignora acentos y prioriza los que empiezan por el texto', () => {
    expect(matchCategories(categories, 'cafe').map((c) => c.key)).toEqual(['cafeteria']);
    expect(
      matchCategories(categories, 'r')
        .map((c) => c.key)
        .slice(0, 2),
    ).toEqual(['restaurantes', 'ropa']);
    expect(matchCategories(categories, 'online').map((c) => c.key)).toEqual(['compras-online']);
    expect(matchCategories(categories, '  ')).toEqual([]);
  });

  it('groupTitle usa el comercio o, si no hay, el concepto sin la localidad', () => {
    expect(groupTitle({ merchantKey: 'froiz cangas 1', sampleDescription: 'FROIZ' })).toBe(
      'Froiz cangas 1',
    );
    expect(groupTitle({ merchantKey: null, sampleDescription: 'regalo panchuki' })).toBe(
      'Regalo panchuki',
    );
  });

  it('sourceLabel concuerda en singular y plural', () => {
    expect(sourceLabel({ category: 'a', source: 'history', count: 1 })).toContain('1 vez');
    expect(sourceLabel({ category: 'a', source: 'history', count: 5 })).toContain('5 veces');
  });

  it('progressPercent acota y no divide por cero', () => {
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(20, 10)).toBe(100);
  });

  it('mergeGroups no repite grupos ya cargados', () => {
    const merged = mergeGroups([group(['a', 'b'])], [group(['b']), group(['c'])]);
    expect(merged.map((g) => g.ids)).toEqual([['a', 'b'], ['c']]);
  });

  it('newCategoryFromQuery propone nombre y clave, y no repite las existentes', () => {
    expect(newCategoryFromQuery('  mascotas ', categories)).toEqual({
      key: 'mascotas',
      name: 'Mascotas',
    });
    expect(newCategoryFromQuery('Ocio y cultura', categories)?.key).toBe('ocio_y_cultura');
    expect(newCategoryFromQuery('cafetería', categories)).toBeNull(); // ya existe (sin acentos)
    expect(newCategoryFromQuery('ropa', categories)).toBeNull();
    expect(newCategoryFromQuery('  ', categories)).toBeNull();
    expect(newCategoryFromQuery('!!!', categories)).toBeNull();
  });

  it('orderByUsage ordena por uso, deja Otros al final y desempata por orden de serie', () => {
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
