import type { BoardColumn, Item } from '@rayrecords/shared';
import {
  applyMove,
  columnHue,
  columnKey,
  dropRequest,
  isOverdue,
  itemsInColumn,
  moveToRequest,
  neighbourId,
  shiftRequest,
  shortDate,
  stepRequest,
  summaryText,
  tagHue,
  todayLocal,
} from './board-logic';

const columns: BoardColumn[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'enCurso', label: 'En curso' },
  { key: 'hecho', label: 'Hecho' },
];

function item(id: string, column: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    listId: 'l1',
    title: id,
    tags: [],
    extra: {},
    column,
    order: 0,
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

// Pending: a, b, c · In progress: d, e · Done: (empty)
const items = [
  item('a', 'pendiente'),
  item('b', 'pendiente'),
  item('c', 'pendiente'),
  item('d', 'enCurso'),
  item('e', 'enCurso'),
];

const ids = (list: Item[]) => list.map((i) => i.id).join('');

describe('board-logic: dropping a card', () => {
  it('at the start of another column, afterId is null', () => {
    expect(dropRequest(items, 'a', 'enCurso', 0)).toEqual({ afterId: null, column: 'enCurso' });
  });

  it('between two cards of another column, it goes after the one above', () => {
    expect(dropRequest(items, 'a', 'enCurso', 1)).toEqual({ afterId: 'd', column: 'enCurso' });
  });

  it('at the end of another column, it goes after the last one', () => {
    expect(dropRequest(items, 'a', 'enCurso', 2)).toEqual({ afterId: 'e', column: 'enCurso' });
    expect(dropRequest(items, 'a', 'enCurso', 99)).toEqual({ afterId: 'e', column: 'enCurso' });
  });

  it('in an empty column, afterId is null', () => {
    expect(dropRequest(items, 'a', 'hecho', 0)).toEqual({ afterId: null, column: 'hecho' });
  });

  it('reordering within the same column ignores the card itself', () => {
    // a moves to position 2 of [b, c]: after c.
    expect(dropRequest(items, 'a', 'pendiente', 2)).toEqual({ afterId: 'c', column: 'pendiente' });
    // c moves to position 1 of [a, b]: after a.
    expect(dropRequest(items, 'c', 'pendiente', 1)).toEqual({ afterId: 'a', column: 'pendiente' });
    // c moves to the start.
    expect(dropRequest(items, 'c', 'pendiente', 0)).toEqual({ afterId: null, column: 'pendiente' });
  });
});

describe('board-logic: move up, move down and change column', () => {
  it('moving up puts the card after the one two places before', () => {
    expect(stepRequest(items, 'c', -1)).toEqual({ afterId: 'a', column: 'pendiente' });
    expect(stepRequest(items, 'b', -1)).toEqual({ afterId: null, column: 'pendiente' });
  });

  it('moving down puts the card after the next one', () => {
    expect(stepRequest(items, 'a', 1)).toEqual({ afterId: 'b', column: 'pendiente' });
  });

  it('no movement at the ends', () => {
    expect(stepRequest(items, 'a', -1)).toBeNull();
    expect(stepRequest(items, 'c', 1)).toBeNull();
    expect(stepRequest(items, 'zz', 1)).toBeNull();
  });

  it('changing column puts the card at the end of the neighbour', () => {
    expect(shiftRequest(items, columns, 'a', 1)).toEqual({ afterId: 'e', column: 'enCurso' });
    expect(shiftRequest(items, columns, 'd', 1)).toEqual({ afterId: null, column: 'hecho' });
    expect(shiftRequest(items, columns, 'd', -1)).toEqual({ afterId: 'c', column: 'pendiente' });
  });

  it('there is no column beyond the ends', () => {
    expect(shiftRequest(items, columns, 'a', -1)).toBeNull();
    expect(shiftRequest([item('h', 'hecho')], columns, 'h', 1)).toBeNull();
  });
});

describe('board-logic: move to a column («Mover a…» menu)', () => {
  it('the card goes to the end of the chosen column', () => {
    expect(moveToRequest(items, 'a', 'enCurso')).toEqual({ afterId: 'e', column: 'enCurso' });
  });

  it('in an empty column it becomes the first', () => {
    expect(moveToRequest(items, 'a', 'hecho')).toEqual({ afterId: null, column: 'hecho' });
  });

  it('no movement if already in that column or it does not exist', () => {
    expect(moveToRequest(items, 'a', 'pendiente')).toBeNull();
    expect(moveToRequest(items, 'zz', 'hecho')).toBeNull();
  });
});

describe('board-logic: local mirror of a move', () => {
  it('reorders within the column', () => {
    expect(ids(applyMove(items, 'a', 'pendiente', 'c'))).toBe('bcade');
    expect(ids(applyMove(items, 'c', 'pendiente', null))).toBe('cabde');
  });

  it('changes column and position', () => {
    const moved = applyMove(items, 'a', 'enCurso', 'd');
    expect(itemsInColumn(moved, 'enCurso').map((i) => i.id)).toEqual(['d', 'a', 'e']);
    expect(itemsInColumn(moved, 'pendiente').map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('at the start of a column with cards, it becomes the first', () => {
    const moved = applyMove(items, 'a', 'enCurso', null);
    expect(itemsInColumn(moved, 'enCurso').map((i) => i.id)).toEqual(['a', 'd', 'e']);
  });

  it('in an empty column it just adds it', () => {
    const moved = applyMove(items, 'a', 'hecho', null);
    expect(itemsInColumn(moved, 'hecho').map((i) => i.id)).toEqual(['a']);
  });

  it('does not touch the original list and keeps an unknown card', () => {
    applyMove(items, 'a', 'hecho', null);
    expect(ids(items)).toBe('abcde');
    expect(ids(applyMove(items, 'zz', 'hecho', null))).toBe('abcde');
  });
});

describe('board-logic: J and K traversal', () => {
  it('with no selection it starts at the beginning or the end', () => {
    expect(neighbourId(items, columns, null, 1)).toBe('a');
    expect(neighbourId(items, columns, null, -1)).toBe('e');
  });

  it('moves down the column and jumps to the next', () => {
    expect(neighbourId(items, columns, 'a', 1)).toBe('b');
    expect(neighbourId(items, columns, 'c', 1)).toBe('d');
    expect(neighbourId(items, columns, 'd', -1)).toBe('c');
  });

  it('stays put at the ends and on an empty board', () => {
    expect(neighbourId(items, columns, 'a', -1)).toBeNull();
    expect(neighbourId(items, columns, 'e', 1)).toBeNull();
    expect(neighbourId([], columns, null, 1)).toBeNull();
  });
});

describe('board-logic: column keys', () => {
  it('converts the name to camelCase without accents or symbols', () => {
    expect(columnKey('Por hacer', [])).toBe('porHacer');
    expect(columnKey('En revisión', [])).toBe('enRevision');
    expect(columnKey('  ¡Listo!  ', [])).toBe('listo');
  });

  it('avoids repeated keys and keys that do not start with a letter', () => {
    expect(columnKey('Hecho', ['hecho'])).toBe('hecho2');
    expect(columnKey('Hecho', ['hecho', 'hecho2'])).toBe('hecho3');
    expect(columnKey('2026', [])).toBe('col2026');
    expect(columnKey('???', [])).toBe('col');
  });
});

describe('board-logic: dates and summary', () => {
  it('gives short dates regardless of time zone', () => {
    expect(shortDate('2026-11-12')).toBe('12 nov');
    expect(shortDate('2026-01-03T23:30:00.000Z')).toBe('3 ene');
    expect(shortDate('basura')).toBe('basura');
  });

  it('gives today in local time', () => {
    expect(todayLocal(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('flags only a past date as overdue', () => {
    expect(isOverdue('2026-11-03', '2026-11-04')).toBe(true);
    expect(isOverdue('2026-11-04', '2026-11-04')).toBe(false);
    expect(isOverdue(undefined, '2026-11-04')).toBe(false);
  });

  it('summarises with correct plurals', () => {
    const done = { doneAt: '2026-01-02T00:00:00.000Z' };
    expect(summaryText([], 'card')).toBe('0 tarjetas');
    expect(summaryText([item('a', 'x')], 'card')).toBe('1 tarjeta');
    expect(summaryText([item('a', 'x', done), item('b', 'x', done), item('c', 'x')], 'card')).toBe(
      '3 tarjetas · 2 hechas',
    );
    expect(summaryText([item('a', 'x', done)], 'item')).toBe('1 elemento · 1 hecho');
  });
});

describe('board colours', () => {
  it('colours the usual columns by name', () => {
    expect(columnHue('Por hacer', 0)).toBe('blue');
    expect(columnHue('Pendiente', 2)).toBe('blue');
    expect(columnHue('En curso', 1)).toBe('amber');
    expect(columnHue('Hecho', 5)).toBe('green');
  });

  it('columns with other names use colours different from the status ones, by position', () => {
    expect(columnHue('Bloqueado', 0)).toBe('violet');
    expect(columnHue('Bloqueado', 1)).toBe('teal');
    expect(columnHue('Bloqueado', 3)).toBe('violet');
  });

  it('priority labels have a fixed colour', () => {
    expect(tagHue('alta')).toBe('rose');
    expect(tagHue('Media')).toBe('amber');
    expect(tagHue('baja')).toBe('green');
  });

  it('other labels have a stable colour per text', () => {
    expect(tagHue('cocina')).toBe(tagHue('Cocina '));
    expect(['blue', 'green', 'amber', 'rose', 'violet', 'teal']).toContain(tagHue('lo que sea'));
  });
});
