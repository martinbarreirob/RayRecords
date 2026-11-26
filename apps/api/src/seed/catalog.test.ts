import { BoardColumn, ListSchema } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog';

const NOW = new Date('2026-11-03T10:00:00Z');
const catalog = () => buildCatalog(NOW, '2026-11-03');

describe('buildCatalog', () => {
  it('gives the board columns that the schema accepts, with a state icon and a colour each', () => {
    const board = catalog().lists.find((list) => list.kind === 'board')!;
    const columns = board.board!.columns;
    expect(columns.length).toBeGreaterThan(3);
    for (const column of columns) {
      expect(BoardColumn.safeParse(column).success, column.key).toBe(true);
      expect(column.icon).toBeDefined();
      expect(column.color).toBeDefined();
    }
    expect(ListSchema.shape.board.safeParse(board.board).success).toBe(true);
  });

  it('puts every card of the board in a column that exists, with a priority', () => {
    const { lists, items } = catalog();
    const board = lists.find((list) => list.kind === 'board')!;
    const keys = new Set(board.board!.columns.map((c) => c.key));
    const cards = items.filter((item) => item.listId.equals(board._id));
    expect(cards.length).toBeGreaterThan(8);
    for (const card of cards) expect(keys.has(card.column!), card.title).toBe(true);
    expect(cards.filter((c) => c.extra['priority'] !== undefined).length).toBeGreaterThan(8);
    // Every column holds something, so the board looks full.
    for (const key of keys)
      expect(
        cards.some((c) => c.column === key),
        key,
      ).toBe(true);
  });

  it('writes a history entry for every item, and the moves of a card end in its column', () => {
    const { lists, items, history } = catalog();
    for (const item of items) {
      expect(history.some((h) => h.itemId.equals(item._id) && h.type === 'created')).toBe(true);
    }
    const board = lists.find((list) => list.kind === 'board')!;
    const done = items.find((item) => item.listId.equals(board._id) && item.column === 'hecho')!;
    const moves = history.filter((h) => h.itemId.equals(done._id) && h.type === 'moved');
    expect(moves.length).toBe(board.board!.columns.length - 1);
    expect(moves.at(-1)!.changes['column']!.to).toBe('hecho');
    for (const h of history) expect(h.changes).toBeTypeOf('object');
  });

  it('keeps the events in their own list for the calendar', () => {
    const { events } = catalog();
    expect(events.length).toBeGreaterThan(0);
  });
});
