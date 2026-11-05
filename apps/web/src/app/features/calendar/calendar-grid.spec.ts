import {
  arrowTarget,
  buildMonthGrid,
  dayParts,
  dayTitle,
  defaultSelection,
  ghostPills,
  groupByDate,
  isOverdueEntry,
  monthTitle,
  rangeKey,
  shiftMonth,
  sortDayEntries,
  splitVisible,
} from './calendar-grid';

describe('calendar-grid', () => {
  it('shiftMonth cruza años', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });

  it('noviembre de 2026 empieza en domingo: la primera semana arranca el lunes 26 de octubre', () => {
    const grid = buildMonthGrid('2026-11');
    expect(grid[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(grid[0]![6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(grid).toHaveLength(6);
    expect(grid.at(-1)![6]!.date).toBe('2026-12-06');
  });

  it('febrero de 2027 (28 días, empieza en lunes) ocupa exactamente 4 semanas', () => {
    const grid = buildMonthGrid('2027-02');
    expect(grid).toHaveLength(4);
    expect(grid[0]![0]).toEqual({ date: '2027-02-01', inMonth: true });
    expect(grid[3]![6]).toEqual({ date: '2027-02-28', inMonth: true });
  });

  it('cada semana tiene siete días y todos los del mes aparecen una vez', () => {
    const grid = buildMonthGrid('2026-08');
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it('groupByDate agrupa por fecha e ignora los elementos sin ella', () => {
    const groups = groupByDate([
      { dueDate: '2026-11-04', n: 1 },
      { n: 2 },
      { dueDate: '2026-11-04', n: 3 },
      { dueDate: '2026-11-05', n: 4 },
    ]);
    expect(groups.get('2026-11-04')!.map((e) => e.n)).toEqual([1, 3]);
    expect(groups.get('2026-11-05')!.map((e) => e.n)).toEqual([4]);
    expect(groups.size).toBe(2);
  });

  it('sortDayEntries pone primero los que no tienen hora y luego ordena por hora y título', () => {
    const sorted = sortDayEntries([
      { title: 'Cena', time: '21:00' },
      { title: 'Zumo' },
      { title: 'Médico', time: '09:30' },
      { title: 'Ana' },
      { title: 'Banco', time: '09:30' },
    ]);
    expect(sorted.map((e) => e.title)).toEqual(['Ana', 'Zumo', 'Banco', 'Médico', 'Cena']);
  });

  it('splitVisible recorta con «+n más», pero no oculta un único elemento sobrante', () => {
    expect(splitVisible([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(splitVisible([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3, 4], more: 0 });
    expect(splitVisible([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(splitVisible([], 3)).toEqual({ shown: [], more: 0 });
  });

  it('isOverdueEntry: solo lo pendiente con fecha anterior a hoy', () => {
    const today = '2026-11-04';
    expect(isOverdueEntry({ dueDate: '2026-11-03' }, today)).toBe(true);
    expect(isOverdueEntry({ dueDate: '2026-11-04' }, today)).toBe(false);
    expect(isOverdueEntry({ dueDate: '2026-11-03', doneAt: '2026-11-03T10:00:00Z' }, today)).toBe(
      false,
    );
    expect(isOverdueEntry({}, today)).toBe(false);
  });

  it('textos de mes y de día en español', () => {
    expect(monthTitle('2026-11')).toBe('Noviembre de 2026');
    expect(dayTitle('2026-11-04')).toBe('Miércoles, 4 de noviembre');
    expect(dayParts('2026-11-04')).toEqual({ weekday: 'Mié', day: '4' });
    expect(dayParts('2026-11-09').day).toBe('9');
  });

  it('defaultSelection elige hoy en el mes actual y el día 1 en los demás', () => {
    expect(defaultSelection('2026-11', '2026-11-04')).toBe('2026-11-04');
    expect(defaultSelection('2026-12', '2026-11-04')).toBe('2026-12-01');
  });

  it('arrowTarget mueve por días y semanas y cruza meses', () => {
    expect(arrowTarget('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(arrowTarget('2026-12-01', 'ArrowLeft')).toBe('2026-11-30');
    expect(arrowTarget('2026-11-04', 'ArrowDown')).toBe('2026-11-11');
    expect(arrowTarget('2026-11-04', 'ArrowUp')).toBe('2026-10-28');
    expect(arrowTarget('2026-11-04', 'Escape')).toBe('2026-11-04');
  });

  it('arrowTarget: Inicio y Fin van al lunes y al domingo de la semana', () => {
    // El 4 de noviembre de 2026 es miércoles.
    expect(arrowTarget('2026-11-04', 'Home')).toBe('2026-11-02');
    expect(arrowTarget('2026-11-04', 'End')).toBe('2026-11-08');
    expect(arrowTarget('2026-11-08', 'Home')).toBe('2026-11-02');
    expect(arrowTarget('2026-11-02', 'End')).toBe('2026-11-08');
  });
});

describe('esqueleto del calendario', () => {
  it('rangeKey identifica el rango pedido por su primer y último día de la rejilla', () => {
    expect(rangeKey(buildMonthGrid('2026-11'))).toBe('2026-10-26..2026-12-06');
    expect(rangeKey(buildMonthGrid('2026-12'))).not.toBe(rangeKey(buildMonthGrid('2026-11')));
  });

  it('ghostPills reparte 0, 1 o 2 píldoras de forma estable', () => {
    const counts = Array.from({ length: 42 }, (_, i) => ghostPills(i).length);
    expect(Math.max(...counts)).toBe(2);
    expect(counts).toContain(0);
    expect(ghostPills(3)).toEqual(ghostPills(3));
    expect(ghostPills(3 + 11)).toEqual(ghostPills(3));
    for (const width of Array.from({ length: 22 }, (_, i) => ghostPills(i)).flat()) {
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(100);
    }
  });
});
