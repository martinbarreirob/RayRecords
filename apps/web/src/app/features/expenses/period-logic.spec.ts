import { describe, expect, it } from 'vitest';
import {
  monthInPeriod,
  periodPresets,
  rangeBetween,
  shiftPeriod,
  wholeYear,
  yearPeriod,
} from './period-logic';

describe('period-logic', () => {
  it('periodPresets calcula los atajos y solo ofrece «Todo» si se admite', () => {
    const presets = periodPresets('2026-02', true);
    const by = Object.fromEntries(presets.map((p) => [p.id, p.period]));
    expect(by['last-month']).toEqual({ from: '2026-01', to: '2026-01' });
    expect(by['last-3']).toEqual({ from: '2025-12', to: '2026-02' });
    expect(by['last-12']).toEqual({ from: '2025-03', to: '2026-02' });
    expect(by['this-year']).toEqual({ from: '2026-01', to: '2026-12' });
    expect(by['all']).toEqual({ from: null, to: null });
    expect(periodPresets('2026-02', false).some((p) => p.id === 'all')).toBe(false);
  });

  it('wholeYear reconoce solo años naturales completos', () => {
    expect(wholeYear(yearPeriod('2025'))).toBe('2025');
    expect(wholeYear({ from: '2025-01', to: '2025-11' })).toBeNull();
    expect(wholeYear({ from: '2025-01', to: '2026-12' })).toBeNull();
    expect(wholeYear({ from: null, to: null })).toBeNull();
  });

  it('rangeBetween ordena los extremos', () => {
    expect(rangeBetween('2026-05', '2026-02')).toEqual({ from: '2026-02', to: '2026-05' });
    expect(rangeBetween('2026-02', '2026-02')).toEqual({ from: '2026-02', to: '2026-02' });
  });

  it('monthInPeriod trata el periodo abierto como «todos»', () => {
    expect(monthInPeriod('2020-01', { from: null, to: null })).toBe(true);
    expect(monthInPeriod('2026-03', { from: '2026-01', to: '2026-02' })).toBe(false);
  });

  it('shiftPeriod salta de año en año o tantos meses como abarque el rango', () => {
    expect(shiftPeriod(yearPeriod('2025'), 1)).toEqual(yearPeriod('2026'));
    expect(shiftPeriod({ from: '2026-01', to: '2026-03' }, -1)).toEqual({
      from: '2025-10',
      to: '2025-12',
    });
    expect(shiftPeriod({ from: '2026-05', to: '2026-05' }, 1)).toEqual({
      from: '2026-06',
      to: '2026-06',
    });
    expect(shiftPeriod({ from: null, to: null }, 1)).toBeNull();
  });
});
