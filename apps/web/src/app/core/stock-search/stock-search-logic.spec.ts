import type { Product } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import { isSellable, searchStock } from './stock-search-logic';

let n = 0;
const product = (name: string, extra: Partial<Product> = {}): Product => ({
  id: String(++n).padStart(24, '0'),
  name,
  categoryId: null,
  quantity: 5,
  minQuantity: 0,
  priceCents: 100,
  costCents: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...extra,
});

const stock = [
  product('Tornillo hexagonal', { sku: 'TOR-01' }),
  product('Arandela'),
  product('Tuerca', { notes: 'Para tornillo M8' }),
];

describe('searchStock', () => {
  it('lists everything by name when nothing is typed', () => {
    expect(searchStock('', stock).map((p) => p.name)).toEqual([
      'Arandela',
      'Tornillo hexagonal',
      'Tuerca',
    ]);
  });

  it('finds by name ignoring accents and case, and ranks the name over the notes', () => {
    expect(searchStock('TORNILLO', stock).map((p) => p.name)).toEqual([
      'Tornillo hexagonal',
      'Tuerca',
    ]);
  });

  it('finds by reference', () => {
    expect(searchStock('tor-01', stock).map((p) => p.name)).toEqual(['Tornillo hexagonal']);
  });

  it('returns nothing when nothing matches and respects the limit', () => {
    expect(searchStock('zzz', stock)).toEqual([]);
    expect(searchStock('', stock, 2)).toHaveLength(2);
  });
});

describe('isSellable', () => {
  it('needs stock beyond what the cart holds', () => {
    const item = product('X', { quantity: 2 });
    expect(isSellable(item, 1)).toBe(true);
    expect(isSellable(item, 2)).toBe(false);
  });
});
