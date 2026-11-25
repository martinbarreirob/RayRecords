import { describe, expect, it } from 'vitest';
import {
  monthInPeriod,
  periodPresets,
  rangeBetween,
  singleMonthLabel,
  singleMonthPresets,
  wholeYear,
  yearPeriod,
} from './period-logic';

describe('period-logic', () => {
  it('periodPresets computes the shortcuts and offers "all" only when allowed', () => {
    const presets = periodPresets('2026-02', true);
    const by = Object.fromEntries(presets.map((p) => [p.id, p.period]));
    expect(by['last-month']).toEqual({ from: '2026-01', to: '2026-01' });
    expect(by['last-3']).toEqual({ from: '2025-12', to: '2026-02' });
    expect(by['last-12']).toEqual({ from: '2025-03', to: '2026-02' });
    expect(by['this-year']).toEqual({ from: '2026-01', to: '2026-12' });
    expect(by['all']).toEqual({ from: null, to: null });
    expect(periodPresets('2026-02', false).some((p) => p.id === 'all')).toBe(false);
  });

  it('singleMonthPresets offers this month and its neighbours, across year ends', () => {
    const presets = singleMonthPresets('2026-12');
    expect(presets.map((p) => p.id)).toEqual(['this-month', 'last-month', 'next-month']);
    expect(presets[0]!.period).toEqual({ from: '2026-12', to: '2026-12' });
    expect(presets[1]!.period).toEqual({ from: '2026-11', to: '2026-11' });
    expect(presets[2]!.period).toEqual({ from: '2027-01', to: '2027-01' });
  });

  it('singleMonthLabel writes the month name and year', () => {
    expect(singleMonthLabel('2026-11')).toBe('noviembre 2026');
  });

  it('wholeYear recognises only full calendar years', () => {
    expect(wholeYear(yearPeriod('2025'))).toBe('2025');
    expect(wholeYear({ from: '2025-01', to: '2025-11' })).toBeNull();
    expect(wholeYear({ from: '2025-01', to: '2026-12' })).toBeNull();
    expect(wholeYear({ from: null, to: null })).toBeNull();
  });

  it('rangeBetween orders the ends', () => {
    expect(rangeBetween('2026-05', '2026-02')).toEqual({ from: '2026-02', to: '2026-05' });
    expect(rangeBetween('2026-02', '2026-02')).toEqual({ from: '2026-02', to: '2026-02' });
  });

  it('monthInPeriod treats an open period as all months', () => {
    expect(monthInPeriod('2020-01', { from: null, to: null })).toBe(true);
    expect(monthInPeriod('2026-03', { from: '2026-01', to: '2026-02' })).toBe(false);
  });
});
