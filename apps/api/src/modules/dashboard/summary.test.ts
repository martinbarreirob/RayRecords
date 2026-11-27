import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import type { ProductDoc, TicketDoc } from '../../db/documents';
import { summarize } from './summary';

const ZONE = 'Europe/Madrid';
/** Thursday 19 November 2026, 13:00 in Madrid. */
const NOW = new Date('2026-11-19T12:00:00.000Z');
const DRINKS = new ObjectId();

function product(name: string, overrides: Partial<ProductDoc> = {}): ProductDoc {
  return {
    _id: new ObjectId(),
    name,
    categoryId: null,
    quantity: 10,
    minQuantity: 0,
    priceCents: 100,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

let nextNumber = 1;
/** `legacy` is a ticket made before costs were recorded: its lines carry no unit cost. */
function ticket(iso: string, lines: [ProductDoc, number][], legacy = false): TicketDoc {
  const docs = lines.map(([p, quantity]) => ({
    productId: p._id,
    name: p.name,
    quantity,
    unitPriceCents: p.priceCents,
    ...(!legacy && p.costCents !== undefined && { unitCostCents: p.costCents }),
  }));
  return {
    _id: new ObjectId(),
    number: nextNumber++,
    lines: docs,
    totalCents: docs.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
    createdAt: new Date(iso),
  };
}

const water = product('Agua', {
  categoryId: DRINKS,
  priceCents: 60,
  costCents: 25,
  quantity: 40,
});
const coffee = product('Café', {
  categoryId: DRINKS,
  priceCents: 350,
  costCents: 200,
  quantity: 2,
  minQuantity: 5,
});
const batteries = product('Pilas', {
  priceCents: 500,
  costCents: 300,
  quantity: 0,
  minQuantity: 2,
});
const gone = product('Descatalogado', { priceCents: 1000 });
const products = [water, coffee, batteries];

const tickets = [
  ticket('2026-11-19T09:00:00.000Z', [[water, 3]]), // today: 180
  ticket('2026-11-19T10:30:00.000Z', [
    [coffee, 1],
    [batteries, 2],
  ]), // today: 1350
  ticket('2026-11-17T23:30:00.000Z', [[water, 10]], true), // already the 18th in Madrid: 600
  ticket('2026-11-13T12:00:00.000Z', [[gone, 1]]), // first day of the 7-day period: 1000
  ticket('2026-11-12T22:59:00.000Z', [[coffee, 2]]), // still the 12th: previous period, 700
  ticket('2026-11-06T12:00:00.000Z', [[water, 1]]), // first day of the previous period: 60
  ticket('2026-11-05T12:00:00.000Z', [[water, 100]]), // before both: ignored
];

const summary = summarize(tickets, products, 7, ZONE, NOW);

describe('summarize', () => {
  it('covers the last days up to today, one entry per day', () => {
    expect(summary.from).toBe('2026-11-13');
    expect(summary.to).toBe('2026-11-19');
    expect(summary.days.map((day) => day.date)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);
  });

  it('puts each ticket on its day in the app time zone, with zeros on the quiet days', () => {
    const byDate = Object.fromEntries(summary.days.map((day) => [day.date, day]));
    expect(byDate['2026-11-18']).toMatchObject({ totalCents: 600, tickets: 1, units: 10 });
    expect(byDate['2026-11-17']).toMatchObject({ totalCents: 0, tickets: 0, units: 0 });
    expect(byDate['2026-11-13']).toMatchObject({ totalCents: 1000, tickets: 1 });
  });

  it('totals the period, the one before it and today', () => {
    // Costs: 75 + 800, the legacy ticket at the current cost (250) and the deleted product (0).
    expect(summary.totals).toEqual({
      totalCents: 180 + 1350 + 600 + 1000,
      costCents: 75 + 800 + 250,
      tickets: 4,
      units: 17,
    });
    expect(summary.previous).toEqual({ totalCents: 760, costCents: 425, tickets: 2, units: 3 });
    expect(summary.today).toMatchObject({ totalCents: 1530, costCents: 875, tickets: 2, units: 6 });
  });

  it('ranks the best sellers of the period by units', () => {
    expect(summary.topProducts.map((p) => [p.name, p.units, p.totalCents])).toEqual([
      ['Agua', 13, 780],
      ['Pilas', 2, 1000],
      ['Descatalogado', 1, 1000],
      ['Café', 1, 350],
    ]);
    // Each carries its current category; a product without one or deleted has none.
    expect(summary.topProducts.map((p) => p.categoryId)).toEqual([
      DRINKS.toHexString(),
      null,
      null,
      DRINKS.toHexString(),
    ]);
  });

  it('splits the sales by the current category; a deleted product has none', () => {
    expect(summary.categories).toEqual([
      { categoryId: null, units: 3, totalCents: 2000 },
      { categoryId: DRINKS.toHexString(), units: 14, totalCents: 1130 },
    ]);
  });

  it('costs a line at the unit cost of the sale, not at the one of today', () => {
    const repriced = { ...water, costCents: 50 };
    const sale = ticket('2026-11-19T09:00:00.000Z', [[water, 4]]); // sold when it cost 25
    const result = summarize([sale], [repriced], 7, ZONE, NOW);
    expect(result.totals).toMatchObject({ totalCents: 240, costCents: 100 });
  });

  it('describes the stock as it is now', () => {
    expect(summary.stock).toEqual({
      products: 3,
      units: 42,
      valueCents: 40 * 60 + 2 * 350,
      costValueCents: 40 * 25 + 2 * 200,
      ok: 1,
      low: 1,
      out: 1,
    });
  });

  it('lists the stock of the best sellers, most sold first, without deleted products', () => {
    expect(summary.topStock.map((p) => [p.name, p.units, p.quantity, p.minQuantity])).toEqual([
      ['Agua', 13, 40, 0],
      ['Pilas', 2, 0, 2],
      ['Café', 1, 2, 5],
    ]);
  });

  it('shows at most the last six tickets', () => {
    const many = Array.from({ length: 12 }, () => ticket('2026-11-19T09:00:00.000Z', [[water, 1]]));
    expect(summarize(many, products, 7, ZONE, NOW).recentTickets).toHaveLength(6);
  });

  it('shows the last tickets, newest first', () => {
    expect(summary.recentTickets).toHaveLength(6);
    expect(summary.recentTickets[0]).toMatchObject({
      number: tickets[6]!.number,
      units: 100,
    });
  });

  it('is all zeros with no sales and no products', () => {
    const blank = summarize([], [], 30, ZONE, NOW);
    expect(blank.days).toHaveLength(30);
    expect(blank.totals).toEqual({ totalCents: 0, costCents: 0, tickets: 0, units: 0 });
    expect(blank.topProducts).toEqual([]);
    expect(blank.stock.products).toBe(0);
  });
});
