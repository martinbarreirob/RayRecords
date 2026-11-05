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
  it('shiftMonth crosses years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });

  it('November 2026 starts on a Sunday: the first week starts on Monday, October 26', () => {
    const grid = buildMonthGrid('2026-11');
    expect(grid[0]![0]).toEqual({ date: '2026-10-26', inMonth: false });
    expect(grid[0]![6]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(grid).toHaveLength(6);
    expect(grid.at(-1)![6]!.date).toBe('2026-12-06');
  });

  it('February 2027 (28 days, starts on Monday) takes exactly 4 weeks', () => {
    const grid = buildMonthGrid('2027-02');
    expect(grid).toHaveLength(4);
    expect(grid[0]![0]).toEqual({ date: '2027-02-01', inMonth: true });
    expect(grid[3]![6]).toEqual({ date: '2027-02-28', inMonth: true });
  });

  it('each week has seven days and every day of the month appears once', () => {
    const grid = buildMonthGrid('2026-08');
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it('groupByDate groups by date and ignores items without one', () => {
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

  it('sortDayEntries puts items without a time first, then sorts by time and title', () => {
    const sorted = sortDayEntries([
      { title: 'Cena', time: '21:00' },
      { title: 'Zumo' },
      { title: 'Médico', time: '09:30' },
      { title: 'Ana' },
      { title: 'Banco', time: '09:30' },
    ]);
    expect(sorted.map((e) => e.title)).toEqual(['Ana', 'Zumo', 'Banco', 'Médico', 'Cena']);
  });

  it('splitVisible trims with "+n más" but does not hide a single leftover item', () => {
    expect(splitVisible([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(splitVisible([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3, 4], more: 0 });
    expect(splitVisible([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(splitVisible([], 3)).toEqual({ shown: [], more: 0 });
  });

  it('isOverdueEntry: only pending items dated before today', () => {
    const today = '2026-11-04';
    expect(isOverdueEntry({ dueDate: '2026-11-03' }, today)).toBe(true);
    expect(isOverdueEntry({ dueDate: '2026-11-04' }, today)).toBe(false);
    expect(isOverdueEntry({ dueDate: '2026-11-03', doneAt: '2026-11-03T10:00:00Z' }, today)).toBe(
      false,
    );
    expect(isOverdueEntry({}, today)).toBe(false);
  });

  it('month and day labels in Spanish', () => {
    expect(monthTitle('2026-11')).toBe('Noviembre de 2026');
    expect(dayTitle('2026-11-04')).toBe('Miércoles, 4 de noviembre');
    expect(dayParts('2026-11-04')).toEqual({ weekday: 'Mié', day: '4' });
    expect(dayParts('2026-11-09').day).toBe('9');
  });

  it('defaultSelection picks today in the current month and day 1 otherwise', () => {
    expect(defaultSelection('2026-11', '2026-11-04')).toBe('2026-11-04');
    expect(defaultSelection('2026-12', '2026-11-04')).toBe('2026-12-01');
  });

  it('arrowTarget moves by days and weeks and crosses months', () => {
    expect(arrowTarget('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(arrowTarget('2026-12-01', 'ArrowLeft')).toBe('2026-11-30');
    expect(arrowTarget('2026-11-04', 'ArrowDown')).toBe('2026-11-11');
    expect(arrowTarget('2026-11-04', 'ArrowUp')).toBe('2026-10-28');
    expect(arrowTarget('2026-11-04', 'Escape')).toBe('2026-11-04');
  });

  it('arrowTarget: Home and End go to the Monday and Sunday of the week', () => {
    // November 4, 2026 is a Wednesday.
    expect(arrowTarget('2026-11-04', 'Home')).toBe('2026-11-02');
    expect(arrowTarget('2026-11-04', 'End')).toBe('2026-11-08');
    expect(arrowTarget('2026-11-08', 'Home')).toBe('2026-11-02');
    expect(arrowTarget('2026-11-02', 'End')).toBe('2026-11-08');
  });
});

describe('calendar skeleton', () => {
  it('rangeKey identifies the requested range by its first and last grid day', () => {
    expect(rangeKey(buildMonthGrid('2026-11'))).toBe('2026-10-26..2026-12-06');
    expect(rangeKey(buildMonthGrid('2026-12'))).not.toBe(rangeKey(buildMonthGrid('2026-11')));
  });

  it('ghostPills gives 0, 1 or 2 pills in a stable way', () => {
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
