import type { Dashboard, StockCategory } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import {
  averageTicket,
  axisDays,
  bestDay,
  categoryRows,
  changeLabel,
  changePercent,
  dayBars,
  longDay,
  productRows,
  shortDay,
  stockSlices,
} from './dashboard-logic';

const day = (date: string, totalCents: number): Dashboard['days'][number] => ({
  date,
  totalCents,
  tickets: totalCents ? 1 : 0,
  units: totalCents ? 2 : 0,
});

const days = [
  day('2026-11-13', 1000),
  day('2026-11-14', 0),
  day('2026-11-15', 4000),
  day('2026-11-16', 20),
  day('2026-11-17', 2000),
];

describe('dates', () => {
  it('writes a day short and long, without shifting it', () => {
    expect(shortDay('2026-11-18')).toBe('18 nov');
    expect(longDay('2026-11-18')).toBe('miércoles, 18 de noviembre');
    expect(shortDay('2026-01-01')).toBe('1 ene');
  });
});

describe('change against the period before', () => {
  it('is a whole percentage, up or down', () => {
    expect(changePercent(150, 100)).toBe(50);
    expect(changePercent(75, 100)).toBe(-25);
    expect(changePercent(100, 100)).toBe(0);
  });

  it('is nothing when there is no earlier figure', () => {
    expect(changePercent(100, 0)).toBeNull();
  });

  it('reads as a sentence', () => {
    expect(changeLabel(150, 100, 30)).toBe('+50 % frente a los 30 días anteriores');
    expect(changeLabel(75, 100, 7)).toBe('−25 % frente a los 7 días anteriores');
    expect(changeLabel(100, 100, 7)).toBe('0 % frente a los 7 días anteriores');
    expect(changeLabel(100, 0, 7)).toBe('Sin datos anteriores');
    expect(changeLabel(0, 0, 7)).toBe('Sin ventas todavía');
  });
});

describe('averageTicket', () => {
  it('divides the money by the tickets, and is 0 with none', () => {
    expect(averageTicket({ totalCents: 1000, tickets: 3, units: 9 })).toBe(333);
    expect(averageTicket({ totalCents: 0, tickets: 0, units: 0 })).toBe(0);
  });
});

describe('daily chart', () => {
  it('scales every bar to the best day and keeps a small sale visible', () => {
    expect(dayBars(days).map((bar) => bar.height)).toEqual([25, 0, 100, 2, 50]);
  });

  it('is flat when nothing was sold', () => {
    expect(dayBars([day('2026-11-13', 0), day('2026-11-14', 0)]).map((b) => b.height)).toEqual([
      0, 0,
    ]);
  });

  it('finds the best day, if there is one', () => {
    expect(bestDay(days)?.date).toBe('2026-11-15');
    expect(bestDay([day('2026-11-13', 0)])).toBeNull();
  });

  it('labels the first, the middle and the last day', () => {
    expect(axisDays(days)).toEqual(['13 nov', '15 nov', '17 nov']);
    expect(axisDays([day('2026-11-13', 0)])).toEqual(['13 nov']);
    expect(axisDays([])).toEqual([]);
  });
});

describe('ranked rows', () => {
  it('sizes the best sellers by units against the first one', () => {
    const rows = productRows([
      { productId: 'a'.repeat(24), name: 'Agua', units: 20, totalCents: 1200 },
      { productId: 'b'.repeat(24), name: 'Café', units: 5, totalCents: 1750 },
    ]);
    expect(rows.map((row) => [row.label, row.value, row.width])).toEqual([
      ['Agua', 20, 100],
      ['Café', 5, 25],
    ]);
  });

  it('names each category, merging what has none or one that no longer exists', () => {
    const drinks: StockCategory = {
      id: 'a'.repeat(24),
      name: 'Bebidas',
      icon: 'bottle',
      color: '#e8effc',
      iconColor: '#1d4fb8',
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const rows = categoryRows(
      [
        { categoryId: null, units: 1, totalCents: 500 },
        { categoryId: drinks.id, units: 9, totalCents: 4000 },
        { categoryId: 'f'.repeat(24), units: 2, totalCents: 1500 },
      ],
      [drinks],
    );
    expect(rows.map((row) => [row.label, row.value, row.width])).toEqual([
      ['Bebidas', 4000, 100],
      ['Sin categoría', 2000, 50],
    ]);
    expect(rows[0]?.category).toBe(drinks);
    expect(rows[1]?.category).toBeUndefined();
  });
});

describe('stockSlices', () => {
  it('shares the products out by state', () => {
    const slices = stockSlices({ products: 20, units: 0, valueCents: 0, ok: 15, low: 3, out: 2 });
    expect(slices.map((slice) => [slice.id, slice.count, slice.share])).toEqual([
      ['ok', 15, 75],
      ['low', 3, 15],
      ['out', 2, 10],
    ]);
  });

  it('is empty with no products', () => {
    const slices = stockSlices({ products: 0, units: 0, valueCents: 0, ok: 0, low: 0, out: 0 });
    expect(slices.every((slice) => slice.share === 0)).toBe(true);
  });
});
