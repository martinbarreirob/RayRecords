import {
  dateOfMonth,
  filterMovements,
  groupMovements,
  MIXED_CATEGORY,
  toggleExpanded,
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
    categoryLook: null,
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

describe('groupMovements', () => {
  let seq = 0;
  const mv = (description: string, amountCents: number, date: string, category: string | null) =>
    row({
      id: String(++seq).padStart(24, '0'),
      description,
      amountCents,
      date,
      category,
      categoryName: category === null ? 'Sin categoría' : category.toUpperCase(),
    });

  it('groups by the normalised description and shows the first original one', () => {
    const groups = groupMovements([
      mv('Cafetería Ñandú', -200, '2026-11-01', 'ocio'),
      mv('CAFETERIA ñandu', -300, '2026-11-05', 'ocio'),
      mv('Alquiler', -50000, '2026-11-02', 'hogar'),
    ]);
    expect(groups).toHaveLength(2);
    const cafe = groups.find((g) => g.count === 2)!;
    expect(cafe.description).toBe('Cafetería Ñandú');
    expect(cafe.id).toBe(normalizeText('Cafetería Ñandú'));
  });

  it('groups the movements of one place whose town and terminal reference differ', () => {
    const groups = groupMovements([
      mv('O FORNO PI \\PONTEVEDRA\\ES2609180829', -300, '2026-09-18', null),
      mv('O FORNO PI \\PONTEVEDRA\\ES2609160812', -250, '2026-09-16', null),
      mv('O FORNO PI \\PONTEVEDRA\\ES2609100844', -400, '2026-09-10', null),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.id).toBe('o forno pi');
  });

  it('sums the amounts, counts the movements and keeps the latest date', () => {
    const [group] = groupMovements([
      mv('Bar', -200, '2026-11-01', 'ocio'),
      mv('bar', -300, '2026-11-09', 'ocio'),
      mv('BAR', 100, '2026-11-04', 'ocio'),
    ]);
    expect(group!.amountCents).toBe(-400);
    expect(group!.count).toBe(3);
    expect(group!.date).toBe('2026-11-09');
    expect(group!.rows.map((r) => r.date)).toEqual(['2026-11-09', '2026-11-04', '2026-11-01']);
  });

  it('keeps the shared category, or marks the group as mixed', () => {
    const [same] = groupMovements([
      mv('A', -1, '2026-11-01', 'ocio'),
      mv('a', -1, '2026-11-02', 'ocio'),
    ]);
    expect(same!.mixed).toBe(false);
    expect(same!.category).toBe('ocio');
    expect(same!.categoryName).toBe('OCIO');

    const [mixed] = groupMovements([
      mv('A', -1, '2026-11-01', 'ocio'),
      mv('a', -1, '2026-11-02', null),
    ]);
    expect(mixed!.mixed).toBe(true);
    expect(mixed!.category).toBeNull();
    expect(mixed!.categoryName).toBe(MIXED_CATEGORY);
  });

  it('orders the groups by the size of their total, largest first', () => {
    const groups = groupMovements([
      mv('Pequeño', -100, '2026-11-01', null),
      mv('Grande', -9000, '2026-11-01', null),
      mv('Ingreso', 5000, '2026-11-01', null),
    ]);
    expect(groups.map((g) => g.description)).toEqual(['Grande', 'Ingreso', 'Pequeño']);
  });

  it('is empty for no movements', () => {
    expect(groupMovements([])).toEqual([]);
  });
});

describe('toggleExpanded', () => {
  it('adds and removes a key without touching the original set', () => {
    const none = new Set<string>();
    const one = toggleExpanded(none, 'bar');
    expect([...one]).toEqual(['bar']);
    expect(none.size).toBe(0);
    expect(toggleExpanded(one, 'bar').size).toBe(0);
  });
});
