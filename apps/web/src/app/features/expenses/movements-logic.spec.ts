import {
  dateOfMonth,
  filterMovements,
  inPeriod,
  monthOfDate,
  normalizeText,
  formatDay,
  periodLabel,
  periodSpan,
  periodTotals,
  sectionTotals,
  singleMonth,
  sumCents,
  type MovementRow,
} from './movements-logic';

function row(partial: Partial<MovementRow> & { amountCents: number }): MovementRow {
  return {
    id: 'a'.repeat(24),
    accountId: 'b'.repeat(24),
    date: '2026-11-02',
    month: '2026-11',
    description: 'Movimiento',
    category: null,
    categorySource: 'none',
    categoryName: 'Sin categoría',
    ...partial,
  };
}

const rows: MovementRow[] = [
  row({ amountCents: -1240, description: 'Café del Rincón', category: 'ocio' }),
  row({ amountCents: -5000, description: 'Supermercado Día', category: 'supermercado' }),
  row({ amountCents: -800, description: 'Cine', category: 'ocio' }),
  row({ amountCents: 200000, description: 'Nómina', category: 'nomina' }),
  row({ amountCents: -30000, description: 'Traspaso a ahorro', category: 'traspaso' }),
  row({ amountCents: -999, description: 'Cargo desconocido' }),
];

describe('movements-logic', () => {
  it('sums cents', () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents(rows.slice(0, 3))).toBe(-7040);
  });

  it('groups totals and counts by category, with an entry for uncategorised', () => {
    const totals = sectionTotals(rows);
    expect(totals.get('ocio')).toEqual({ key: 'ocio', totalCents: -2040, count: 2 });
    expect(totals.get(null)).toEqual({ key: null, totalCents: -999, count: 1 });
    expect(totals.get('viajes')).toBeUndefined();
  });

  it('computes expenses, income and balance, ignoring transfers', () => {
    expect(periodTotals(rows)).toEqual({
      expensesCents: -1240 - 5000 - 800 - 999,
      incomeCents: 200000,
      balanceCents: 200000 - 1240 - 5000 - 800 - 999,
    });
    expect(periodTotals([])).toEqual({ expensesCents: 0, incomeCents: 0, balanceCents: 0 });
  });

  it('filters by active section', () => {
    expect(filterMovements(rows, 'all', '')).toHaveLength(6);
    expect(filterMovements(rows, 'ocio', '').map((r) => r.description)).toEqual([
      'Café del Rincón',
      'Cine',
    ]);
    expect(filterMovements(rows, 'none', '').map((r) => r.description)).toEqual([
      'Cargo desconocido',
    ]);
  });

  it('filters by text ignoring accents and case, combined with the section', () => {
    expect(filterMovements(rows, 'all', 'CAFE')).toHaveLength(1);
    expect(filterMovements(rows, 'all', ' dia ').map((r) => r.description)).toEqual([
      'Supermercado Día',
    ]);
    expect(filterMovements(rows, 'ocio', 'dia')).toEqual([]);
    expect(filterMovements(rows, 'ocio', 'cine')).toHaveLength(1);
  });

  it('normalises text', () => {
    expect(normalizeText('  ÁÉÍóú Ñ ')).toBe('aeiou n');
  });

  it('checks whether a month falls in the period', () => {
    expect(inPeriod('2026-10', { from: '2026-09', to: '2026-11' })).toBe(true);
    expect(inPeriod('2026-08', { from: '2026-09', to: '2026-11' })).toBe(false);
    expect(inPeriod('2027-01', { from: '2026-09', to: '2026-11' })).toBe(false);
    expect(inPeriod('1999-01', { from: null, to: null })).toBe(true);
    expect(inPeriod('2026-12', { from: '2026-11', to: null })).toBe(true);
  });

  it('tells a single month from a range or an open period', () => {
    expect(singleMonth({ from: '2026-11', to: '2026-11' })).toBe('2026-11');
    expect(singleMonth({ from: '2026-10', to: '2026-11' })).toBeNull();
    expect(singleMonth({ from: null, to: null })).toBeNull();
    expect(periodSpan({ from: '2026-10', to: '2026-11' })).toBe(2);
    expect(periodSpan({ from: '2025-12', to: '2026-02' })).toBe(3);
    expect(periodSpan({ from: null, to: '2026-02' })).toBeNull();
  });

  it('converts between months and local dates', () => {
    expect(monthOfDate(dateOfMonth('2026-03'))).toBe('2026-03');
    expect(dateOfMonth('2026-11').getDate()).toBe(1);
  });
});

describe('period and date formatting', () => {
  it('describes the period', () => {
    expect(periodLabel({ from: null, to: null })).toBe('Todo el histórico');
    expect(periodLabel({ from: '2026-11', to: '2026-11' })).toBe('noviembre de 2026');
    expect(periodLabel({ from: '2026-09', to: '2026-11' })).toMatch(
      /^sept?\.? 2026 – nov\.? 2026$/,
    );
  });

  it('shortens the day and adds the year only when it is not the current one', () => {
    expect(formatDay('2026-10-28', 2026)).toBe('28 oct');
    expect(formatDay('2025-10-28', 2026)).toBe('28 oct 2025');
  });
});
