import type { MonthlyCategoryTotal } from '@rayrecords/shared';
import { buildSummary, clampRange, monthsInRange, share } from './summary-logic';

const data: MonthlyCategoryTotal[] = [
  { month: '2026-09', category: 'ocio', totalCents: -1000, count: 2 },
  { month: '2026-10', category: 'ocio', totalCents: -500, count: 1 },
  { month: '2026-10', category: 'hogar', totalCents: -9000, count: 3 },
  { month: '2026-10', category: null, totalCents: -250, count: 1 },
];

describe('summary-logic', () => {
  it('lists the months of the range across years, respecting the cap', () => {
    expect(monthsInRange('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsInRange('2026-11', '2026-10')).toEqual([]);
    expect(monthsInRange('2020-01', '2026-12')).toHaveLength(24);
  });

  it('trims a range that is too long', () => {
    expect(clampRange('2020-01', '2026-12')).toEqual(['2020-01', '2021-12']);
    expect(clampRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-03']);
  });

  it('groups by category with monthly and overall totals', () => {
    const summary = buildSummary(data, ['2026-09', '2026-10', '2026-11']);
    expect(summary.rows.map((r) => r.category)).toEqual(['hogar', 'ocio', null]);
    expect(summary.rows[1]).toEqual({
      category: 'ocio',
      byMonth: { '2026-09': -1000, '2026-10': -500 },
      totalCents: -1500,
      count: 3,
    });
    expect(summary.monthTotals).toEqual({ '2026-09': -1000, '2026-10': -9750, '2026-11': 0 });
    expect(summary.grandTotalCents).toBe(-10750);
    expect(summary.monthlyAverageCents).toBe(-3583);
  });

  it('returns zeros for empty data', () => {
    const summary = buildSummary([], ['2026-10']);
    expect(summary.rows).toEqual([]);
    expect(summary.grandTotalCents).toBe(0);
    expect(buildSummary([], []).monthlyAverageCents).toBe(0);
  });

  it('computes percentages without dividing by zero', () => {
    expect(share(-2500, -10000)).toBe(25);
    expect(share(5, 0)).toBe(0);
  });
});
