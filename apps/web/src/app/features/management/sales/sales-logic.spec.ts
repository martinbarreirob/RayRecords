import type { Product, StockCategory } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import {
  addToCart,
  bentoTiles,
  cartRows,
  cartTotal,
  categoryTabs,
  quantityInCart,
  removeLine,
  setQuantity,
  stepCategory,
  unitsByProduct,
} from './sales-logic';

const LOOK = { icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' } as const;

const DRINKS = 'a'.repeat(24);
const SNACKS = 'b'.repeat(24);

const categories: StockCategory[] = [
  { id: SNACKS, name: 'Aperitivos', ...LOOK, createdAt: '2026-11-01T00:00:00.000Z' },
  { id: DRINKS, name: 'Bebidas', ...LOOK, createdAt: '2026-11-01T00:00:00.000Z' },
];

function product(id: number, overrides: Partial<Product>): Product {
  return {
    id: String(id).padStart(24, '0'),
    name: `Producto ${id}`,
    categoryId: null,
    quantity: 5,
    minQuantity: 0,
    priceCents: 100,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const water = product(1, { name: 'Agua', categoryId: DRINKS, quantity: 10, priceCents: 60 });
const coffee = product(2, { name: 'Café', categoryId: DRINKS, quantity: 3, priceCents: 350 });
const crisps = product(3, { name: 'Patatas', categoryId: SNACKS, quantity: 0, priceCents: 150 });
const batteries = product(4, { name: 'Pilas', quantity: 7, priceCents: 500 });
const products = [water, coffee, crisps, batteries];

describe('bentoTiles', () => {
  const sales = unitsByProduct([
    { productId: coffee.id, units: 30 },
    { productId: batteries.id, units: 12 },
  ]);

  it('puts the best sellers first and the rest by name', () => {
    const tiles = bentoTiles(products, sales, 'all');
    expect(tiles.map((tile) => tile.product.name)).toEqual(['Café', 'Pilas', 'Agua', 'Patatas']);
    expect(tiles.map((tile) => tile.units)).toEqual([30, 12, 0, 0]);
  });

  it('gives the large cards only to products that have sold', () => {
    const tiles = bentoTiles(products, sales, 'all');
    expect(tiles.map((tile) => tile.size)).toEqual(['xl', 'xl', 'normal', 'normal']);
  });

  it('uses two big cards, three wide ones and normal for the rest', () => {
    const many = Array.from({ length: 7 }, (_, index) => product(10 + index, {}));
    const units = unitsByProduct(many.map((p, index) => ({ productId: p.id, units: 70 - index })));
    expect(bentoTiles(many, units, 'all').map((tile) => tile.size)).toEqual([
      'xl',
      'xl',
      'wide',
      'wide',
      'wide',
      'normal',
      'normal',
    ]);
  });

  it('ranks inside the category on screen', () => {
    const tiles = bentoTiles(products, sales, DRINKS);
    expect(tiles.map((tile) => [tile.product.name, tile.size])).toEqual([
      ['Café', 'xl'],
      ['Agua', 'normal'],
    ]);
    expect(bentoTiles(products, sales, 'none').map((tile) => tile.product.name)).toEqual(['Pilas']);
  });

  it('with no sales yet every card is the same size', () => {
    const sizes = bentoTiles(products, new Map(), 'all').map((tile) => tile.size);
    expect(new Set(sizes)).toEqual(new Set(['normal']));
  });
});

describe('category tabs', () => {
  it('lists all, each category and the uncategorized ones when there are any', () => {
    expect(categoryTabs(categories, products).map((tab) => tab.label)).toEqual([
      'Todas',
      'Aperitivos',
      'Bebidas',
      'Sin categoría',
    ]);
    expect(categoryTabs(categories, [water]).map((tab) => tab.id)).toEqual(['all', SNACKS, DRINKS]);
  });

  it('is just "Todas" when the user has no categories', () => {
    expect(categoryTabs([], products)).toEqual([{ id: 'all', label: 'Todas' }]);
  });

  it('steps with the arrows and goes round at both ends', () => {
    const tabs = categoryTabs(categories, products);
    expect(stepCategory(tabs, 'all', 1)).toBe(SNACKS);
    expect(stepCategory(tabs, 'all', -1)).toBe('none');
    expect(stepCategory(tabs, 'none', 1)).toBe('all');
    expect(stepCategory(tabs, 'gone', 1)).toBe(SNACKS);
  });
});

describe('cart', () => {
  it('adds a product and then raises its quantity', () => {
    let lines = addToCart([], water);
    lines = addToCart(lines, coffee);
    lines = addToCart(lines, water, 2);
    expect(lines).toEqual([
      { productId: water.id, quantity: 3 },
      { productId: coffee.id, quantity: 1 },
    ]);
    expect(quantityInCart(lines, water.id)).toBe(3);
    expect(quantityInCart(lines, batteries.id)).toBe(0);
  });

  it('never goes over the stock and ignores a sold-out product', () => {
    expect(addToCart([], coffee, 9)).toEqual([{ productId: coffee.id, quantity: 3 }]);
    expect(addToCart([{ productId: coffee.id, quantity: 3 }], coffee)).toEqual([
      { productId: coffee.id, quantity: 3 },
    ]);
    expect(addToCart([], crisps)).toEqual([]);
  });

  it('sets a quantity between 1 and the stock', () => {
    const lines = [{ productId: water.id, quantity: 2 }];
    expect(setQuantity(lines, water.id, 6, 10)[0]?.quantity).toBe(6);
    expect(setQuantity(lines, water.id, 99, 10)[0]?.quantity).toBe(10);
    expect(setQuantity(lines, water.id, 0, 10)[0]?.quantity).toBe(1);
    expect(setQuantity(lines, water.id, Number.NaN, 10)[0]?.quantity).toBe(1);
  });

  it('removes a line', () => {
    const lines = [
      { productId: water.id, quantity: 2 },
      { productId: coffee.id, quantity: 1 },
    ];
    expect(removeLine(lines, water.id)).toEqual([{ productId: coffee.id, quantity: 1 }]);
  });

  it('shows the lines with name, price and totals', () => {
    const rows = cartRows(
      [
        { productId: water.id, quantity: 4 },
        { productId: coffee.id, quantity: 2 },
      ],
      products,
    );
    expect(rows).toEqual([
      {
        productId: water.id,
        quantity: 4,
        name: 'Agua',
        unitPriceCents: 60,
        totalCents: 240,
        max: 10,
      },
      {
        productId: coffee.id,
        quantity: 2,
        name: 'Café',
        unitPriceCents: 350,
        totalCents: 700,
        max: 3,
      },
    ]);
    expect(cartTotal(rows)).toEqual({ units: 6, totalCents: 940 });
  });

  it('drops what is gone or sold out and lowers what no longer fits', () => {
    const rows = cartRows(
      [
        { productId: coffee.id, quantity: 8 },
        { productId: crisps.id, quantity: 1 },
        { productId: 'f'.repeat(24), quantity: 1 },
      ],
      products,
    );
    expect(rows.map((row) => [row.name, row.quantity])).toEqual([['Café', 3]]);
  });
});
