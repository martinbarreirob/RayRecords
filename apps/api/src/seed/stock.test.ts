import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { SHOP_CATEGORIES, buildStock } from './stock';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const build = (seed = 42) => buildStock(NOW, createRng(seed));

/** Ids are random on every run: compare what the data says, not the ids. */
const shape = (seed: number) => {
  const { products, tickets } = build(seed);
  return {
    quantities: products.map((product) => [product.name, product.quantity]),
    tickets: tickets.map((ticket) => [
      ticket.number,
      ticket.createdAt.toISOString(),
      ticket.totalCents,
      ticket.lines.map((line) => [line.name, line.quantity]),
    ]),
  };
};

describe('buildStock', () => {
  it('is deterministic for a seed and differs for another', () => {
    expect(shape(42)).toEqual(shape(42));
    expect(shape(42)).not.toEqual(shape(7));
  });

  it('has the four categories of the shop and products in each, plus some without one', () => {
    const { categories, products } = build();
    expect(categories.map((category) => category.name)).toEqual([...SHOP_CATEGORIES]);
    for (const category of categories) {
      const count = products.filter((product) => product.categoryId?.equals(category._id)).length;
      expect(count).toBeGreaterThanOrEqual(8);
    }
    expect(products.some((product) => product.categoryId === null)).toBe(true);
    expect(new Set(products.map((product) => product.sku)).size).toBe(products.length);
  });

  it('leaves products in every state: fine, low and sold out', () => {
    const { products } = build();
    expect(products.every((product) => product.quantity >= 0)).toBe(true);
    expect(products.some((product) => product.quantity === 0)).toBe(true);
    expect(
      products.some((product) => product.quantity > 0 && product.quantity <= product.minQuantity),
    ).toBe(true);
    expect(products.some((product) => product.quantity > product.minQuantity)).toBe(true);
  });

  it('numbers the tickets in order of time, none in the future', () => {
    const { tickets } = build();
    expect(tickets.length).toBeGreaterThanOrEqual(40);
    expect(tickets.map((ticket) => ticket.number)).toEqual(tickets.map((_, index) => index + 1));
    const times = tickets.map((ticket) => ticket.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.every((time) => time <= NOW.getTime())).toBe(true);
    expect(NOW.getTime() - times[0]!).toBeLessThanOrEqual(31 * 86_400_000);
  });

  it('prices every ticket from its lines, which point at real products', () => {
    const { products, tickets } = build();
    const byId = new Map(products.map((product) => [product._id.toHexString(), product]));
    for (const ticket of tickets) {
      expect(ticket.lines.length).toBeGreaterThan(0);
      let total = 0;
      for (const line of ticket.lines) {
        const product = byId.get(line.productId.toHexString());
        expect(product?.name).toBe(line.name);
        expect(line.unitPriceCents).toBe(product?.priceCents);
        expect(line.quantity).toBeGreaterThan(0);
        total += line.quantity * line.unitPriceCents;
      }
      expect(ticket.totalCents).toBe(total);
    }
  });

  it('gives a clear best seller for the sales screen', () => {
    const { tickets } = build();
    const units = new Map<string, number>();
    for (const line of tickets.flatMap((ticket) => ticket.lines)) {
      units.set(line.name, (units.get(line.name) ?? 0) + line.quantity);
    }
    expect(units.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...units.values())).toBeGreaterThanOrEqual(8);
  });
});
