import type { Product, StockCategory } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  NO_CATEGORY,
  NO_FILTERS,
  activeFilterCount,
  draftOf,
  filterProducts,
  levelOf,
  parseQuantity,
  productCounts,
  readDraft,
  stockTotals,
  toCreate,
  toRows,
} from './stock-logic';

const LOOK = { icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' } as const;

const DRINKS = 'a'.repeat(24);
const SNACKS = 'b'.repeat(24);

const categories: StockCategory[] = [
  { id: DRINKS, name: 'Bebidas', ...LOOK, createdAt: '2026-11-01T00:00:00.000Z' },
  { id: SNACKS, name: 'Aperitivos', ...LOOK, createdAt: '2026-11-01T00:00:00.000Z' },
];

let nextId = 1;
function product(overrides: Partial<Product>): Product {
  return {
    id: String(nextId++).padStart(24, '0'),
    name: 'Producto',
    categoryId: null,
    quantity: 5,
    minQuantity: 0,
    priceCents: 100,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const products = [
  product({ name: 'Café molido', sku: 'CAF-1', categoryId: DRINKS, quantity: 12, priceCents: 350 }),
  product({ name: 'Agua', categoryId: DRINKS, quantity: 2, minQuantity: 6, priceCents: 60 }),
  product({ name: 'Patatas', categoryId: SNACKS, quantity: 0, minQuantity: 4, priceCents: 150 }),
  product({ name: 'Pilas', quantity: 3, priceCents: 500 }),
];
const rows = toRows(products, categories);

describe('levelOf', () => {
  it('is out with nothing left, whatever the minimum', () => {
    expect(levelOf({ quantity: 0, minQuantity: 0 })).toBe('out');
  });

  it('is low at or under the minimum', () => {
    expect(levelOf({ quantity: 4, minQuantity: 4 })).toBe('low');
    expect(levelOf({ quantity: 5, minQuantity: 4 })).toBe('ok');
  });

  it('never warns when the minimum is 0', () => {
    expect(levelOf({ quantity: 1, minQuantity: 0 })).toBe('ok');
  });
});

describe('toRows', () => {
  it('resolves the category name, the level and the value', () => {
    expect(rows[0]).toMatchObject({ categoryName: 'Bebidas', level: 'ok', valueCents: 4200 });
    expect(rows[3]).toMatchObject({ categoryName: NO_CATEGORY });
  });

  it('reads a category that no longer exists as none', () => {
    const [row] = toRows([product({ categoryId: 'c'.repeat(24) })], categories);
    expect(row?.categoryName).toBe(NO_CATEGORY);
  });
});

describe('filterProducts', () => {
  const names = (filters: Partial<typeof NO_FILTERS>) =>
    filterProducts(rows, { ...NO_FILTERS, ...filters }).map((row) => row.name);

  it('returns everything with no filters', () => {
    expect(names({})).toHaveLength(4);
  });

  it('searches the name ignoring accents and case', () => {
    expect(names({ query: 'CAFE' })).toEqual(['Café molido']);
  });

  it('also searches the reference and the category', () => {
    expect(names({ query: 'caf-1' })).toEqual(['Café molido']);
    expect(names({ query: 'bebidas' })).toEqual(['Café molido', 'Agua']);
  });

  it('filters by category and by products without one', () => {
    expect(names({ category: SNACKS })).toEqual(['Patatas']);
    expect(names({ category: 'none' })).toEqual(['Pilas']);
  });

  it('filters by stock level', () => {
    expect(names({ level: 'low' })).toEqual(['Agua']);
    expect(names({ level: 'out' })).toEqual(['Patatas']);
    expect(names({ level: 'ok' })).toEqual(['Café molido', 'Pilas']);
  });

  it('combines the search with the filters', () => {
    expect(names({ query: 'a', category: DRINKS, level: 'low' })).toEqual(['Agua']);
  });
});

describe('activeFilterCount', () => {
  it('counts the panel filters, not the search', () => {
    expect(activeFilterCount({ ...NO_FILTERS, query: 'x' })).toBe(0);
    expect(activeFilterCount({ query: '', category: 'none', level: 'out' })).toBe(2);
  });
});

describe('totals and counts', () => {
  it('adds up units and value', () => {
    expect(stockTotals(rows)).toEqual({ units: 17, valueCents: 4200 + 120 + 0 + 1500 });
  });

  it('counts the products of each category', () => {
    const counts = productCounts(products);
    expect(counts.get(DRINKS)).toBe(2);
    expect(counts.get(SNACKS)).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe('parseQuantity', () => {
  it('reads whole numbers and treats empty as 0', () => {
    expect(parseQuantity(' 12 ')).toBe(12);
    expect(parseQuantity('')).toBe(0);
  });

  it('rejects decimals, negatives, text and huge values', () => {
    for (const text of ['1,5', '-2', 'dos', '1e3', '1000001']) {
      expect(parseQuantity(text)).toBeNull();
    }
  });
});

describe('readDraft', () => {
  it('turns the typed text into values', () => {
    const result = readDraft({
      name: '  Café ',
      sku: ' CAF-1 ',
      categoryId: DRINKS,
      quantity: '12',
      minQuantity: '',
      price: '3,50',
      notes: '',
    });
    expect(result).toEqual({
      ok: true,
      values: {
        name: 'Café',
        sku: 'CAF-1',
        categoryId: DRINKS,
        quantity: 12,
        minQuantity: 0,
        priceCents: 350,
        notes: null,
      },
    });
  });

  it('points at the first field that is wrong', () => {
    expect(readDraft(EMPTY_DRAFT)).toMatchObject({ ok: false, field: 'name' });
    expect(readDraft({ ...EMPTY_DRAFT, name: 'A', quantity: 'x' })).toMatchObject({
      field: 'quantity',
    });
    expect(readDraft({ ...EMPTY_DRAFT, name: 'A', minQuantity: '1.5' })).toMatchObject({
      field: 'minQuantity',
    });
    expect(readDraft({ ...EMPTY_DRAFT, name: 'A', price: 'gratis' })).toMatchObject({
      field: 'price',
    });
    expect(readDraft({ ...EMPTY_DRAFT, name: 'A', price: '-1' })).toMatchObject({ field: 'price' });
  });

  it('round-trips an existing product', () => {
    const original = products[0]!;
    const result = readDraft(draftOf(original));
    expect(result).toMatchObject({
      ok: true,
      values: { name: 'Café molido', sku: 'CAF-1', quantity: 12, priceCents: 350 },
    });
  });
});

describe('toCreate', () => {
  it('leaves out the empty reference and notes', () => {
    const result = readDraft({ ...EMPTY_DRAFT, name: 'Pilas' });
    if (!result.ok) throw new Error('expected a valid draft');
    expect(toCreate(result.values)).toEqual({
      name: 'Pilas',
      categoryId: null,
      quantity: 0,
      minQuantity: 0,
      priceCents: 0,
    });
  });
});
