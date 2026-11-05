import type { NoteCard, NoteGroup } from '@rayrecords/shared';
import {
  DRAG_THRESHOLD,
  advanceDrag,
  dragPreview,
  draggedIds,
  dropMoves,
  groupAround,
  startDrag,
} from './note-drag';

const stamp = '2026-11-04T09:00:00.000Z';

function card(id: string, x: number, y: number, extra: Partial<NoteCard> = {}): NoteCard {
  return {
    id,
    text: id,
    x,
    y,
    w: 280,
    z: 0,
    groupId: null,
    doneAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  };
}

const group: NoteGroup = {
  id: 'g1',
  title: '',
  x: 500,
  y: 100,
  w: 400,
  h: 300,
  createdAt: stamp,
  updatedAt: stamp,
};

const loose = (c: NoteCard) => ({ x: c.x, y: c.y });

describe('advanceDrag', () => {
  const start = () => startDrag('card', 'a', { x: 100, y: 100 }, { x: 50, y: 50, w: 280, h: 0 });

  it('a minimal movement is still a click', () => {
    const drag = start();

    expect(advanceDrag(drag, { x: 102, y: 101 }, [])).toBe(drag);
  });

  it('a click with micro-movement (up to about 7 px) does not drag', () => {
    const drag = start();

    expect(advanceDrag(drag, { x: 104, y: 103 }, [])).toBe(drag);
    expect(advanceDrag(drag, { x: 100 + DRAG_THRESHOLD - 1, y: 100 }, [])).toBe(drag);
    expect(advanceDrag(drag, { x: 100 + DRAG_THRESHOLD, y: 100 }, []).moved).toBe(true);
  });

  it('moves the card the same as the pointer', () => {
    const next = advanceDrag(start(), { x: 160, y: 130 }, []);

    expect(next).toMatchObject({ moved: true, x: 110, y: 80, over: null });
  });

  it('detects the group under the card centre', () => {
    const next = advanceDrag(start(), { x: 600, y: 160 }, [group]);

    expect(next.over).toBe('g1');
  });

  it('does not leave the bounds', () => {
    const next = advanceDrag(start(), { x: -500, y: -500 }, []);

    expect(next).toMatchObject({ x: 0, y: 0 });
  });

  it('resizing respects the group minimum size', () => {
    const drag = startDrag('resize', 'g1', { x: 0, y: 0 }, group);

    const next = advanceDrag(drag, { x: -1000, y: -1000 }, [group]);

    expect(next).toMatchObject({ w: 160, h: 160, x: 500, y: 100 });
  });

  it('a moving group never has a target group', () => {
    const drag = startDrag('group', 'g1', { x: 0, y: 0 }, group);

    expect(advanceDrag(drag, { x: 50, y: 50 }, [group]).over).toBeNull();
  });
});

describe('dropMoves', () => {
  const a = card('a', 100, 100);
  const b = card('b', 400, 100);
  const cards = [a, b, card('c', 700, 700)];

  it('moves the whole selection by the same offset', () => {
    const drag = { ...startDrag('card', 'a', { x: 0, y: 0 }, { x: 100, y: 100, w: 280, h: 0 }) };
    const moved = { ...drag, moved: true, x: 130, y: 90 };

    const moves = dropMoves(moved, cards, new Set(['a', 'b']), [], loose);

    expect(moves).toEqual([
      { id: 'a', x: 130, y: 90, groupId: null },
      { id: 'b', x: 430, y: 90, groupId: null },
    ]);
  });

  it('if the dragged card was not selected, only it moves', () => {
    const moved = {
      ...startDrag('card', 'c', { x: 0, y: 0 }, { x: 700, y: 700, w: 280, h: 0 }),
      moved: true,
      x: 710,
      y: 700,
    };

    const moves = dropMoves(moved, cards, new Set(['a']), [], loose);

    expect(moves).toEqual([{ id: 'c', x: 710, y: 700, groupId: null }]);
  });

  it('when dropped in a group, positions become relative to it', () => {
    const moved = {
      ...startDrag('card', 'a', { x: 0, y: 0 }, { x: 100, y: 100, w: 280, h: 0 }),
      moved: true,
      x: 540,
      y: 150,
      over: 'g1',
    };

    const moves = dropMoves(moved, cards, new Set(['a']), [group], loose);

    expect(moves).toEqual([{ id: 'a', x: 0, y: 0, groupId: 'g1' }]);
  });

  describe('group stack', () => {
    const m1 = card('m1', 0, 0, { groupId: 'g1' });
    const m2 = card('m2', 0, 10, { groupId: 'g1' });
    const m3 = card('m3', 0, 20, { groupId: 'g1' });
    const all = [card('a', 100, 100), m1, m2, m3];
    // Real positions: three 100 px tall cards one below the other.
    const tops: Record<string, number> = { m1: 150, m2: 260, m3: 370 };
    const abs = (c: NoteCard) => (c.groupId ? { x: 500, y: tops[c.id]! } : { x: c.x, y: c.y });
    const heightOf = () => 100;
    const dropAt = (y: number) => ({
      ...startDrag('card', 'a', { x: 0, y: 0 }, { x: 100, y: 100, w: 280, h: 0 }),
      moved: true,
      x: 520,
      y,
      over: 'g1',
    });

    it('dropping between two cards inserts there and reassigns the ones below', () => {
      const moves = dropMoves(dropAt(240), all, new Set(['a']), [group], abs, heightOf);

      expect(moves).toEqual([
        { id: 'a', x: 0, y: 10, groupId: 'g1' },
        { id: 'm2', x: 0, y: 20, groupId: 'g1' },
        { id: 'm3', x: 0, y: 30, groupId: 'g1' },
      ]);
    });

    it('dropping below all makes it last and does not touch the others', () => {
      const moves = dropMoves(dropAt(600), all, new Set(['a']), [group], abs, heightOf);

      expect(moves).toEqual([{ id: 'a', x: 0, y: 30, groupId: 'g1' }]);
    });

    it('dropping above all makes it first', () => {
      const moves = dropMoves(dropAt(0), all, new Set(['a']), [group], abs, heightOf);

      expect(moves[0]).toEqual({ id: 'a', x: 0, y: 0, groupId: 'g1' });
      expect(moves.map((m) => m.id)).toEqual(['a', 'm1', 'm2', 'm3']);
    });

    it('dragging a group card within the same group reorders it', () => {
      const drag = {
        ...startDrag('card', 'm1', { x: 0, y: 0 }, { x: 500, y: 150, w: 280, h: 0 }),
        moved: true,
        x: 500,
        y: 340,
        over: 'g1',
      };

      const moves = dropMoves(drag, all, new Set(['m1']), [group], abs, heightOf);

      expect(moves).toEqual([
        { id: 'm2', x: 0, y: 0, groupId: 'g1' },
        { id: 'm1', x: 0, y: 10, groupId: 'g1' },
      ]);
    });

    it('a multiple selection enters together and keeps its order', () => {
      const b = card('b', 100, 300);
      const drag = {
        ...startDrag('card', 'a', { x: 0, y: 0 }, { x: 100, y: 100, w: 280, h: 0 }),
        moved: true,
        x: 520,
        y: 600,
        over: 'g1',
      };

      const moves = dropMoves(drag, [...all, b], new Set(['a', 'b']), [group], abs, heightOf);

      expect(moves.filter((m) => m.id === 'a' || m.id === 'b').map((m) => [m.id, m.y])).toEqual([
        ['a', 30],
        ['b', 40],
      ]);
    });
  });
});

describe('groupAround', () => {
  it('does nothing without cards', () => {
    expect(groupAround([], loose)).toBeNull();
  });

  it('wraps the cards with margin and room for the title', () => {
    const result = groupAround([card('a', 100, 200)], loose);

    expect(result?.group).toMatchObject({ x: 84, y: 144, w: 312 });
    expect(result?.group.h).toBeGreaterThanOrEqual(160);
    expect(result?.rects).toHaveLength(1);
  });

  it('the group never goes below the minimum size', () => {
    const result = groupAround([card('a', 0, 0, { w: 40 })], loose);

    expect(result?.group.w).toBeGreaterThanOrEqual(160);
  });
});

describe('dragPreview', () => {
  const a = card('a', 100, 100);
  const b = card('b', 400, 100);
  const inGroup = card('d', 20, 30, { groupId: 'g1' });
  const cards = [a, b, inGroup];
  const absolute = (c: NoteCard) =>
    c.groupId ? { x: c.x + group.x, y: c.y + group.y } : { x: c.x, y: c.y };
  const moved = (id: string, x: number, y: number) => ({
    ...startDrag('card', id, { x: 0, y: 0 }, { x: 100, y: 100, w: 280, h: 0 }),
    moved: true,
    x,
    y,
  });

  it('moves all cards of the selection and paints them loose', () => {
    const preview = dragPreview(moved('a', 130, 90), cards, new Set(['a', 'd']), absolute);

    expect(preview.map((c) => [c.id, c.x, c.y, c.groupId])).toEqual([
      ['a', 130, 90, null],
      ['d', 550, 120, null],
    ]);
  });

  it('without the card in the selection only it travels', () => {
    const drag = moved('b', 410, 100);

    expect(draggedIds(drag, new Set(['a']))).toEqual(new Set(['b']));
    expect(dragPreview(drag, cards, new Set(['a']), absolute).map((c) => c.id)).toEqual(['b']);
  });

  it('does not leave the canvas bounds', () => {
    const preview = dragPreview(moved('a', 0, 0), [card('a', 5, 5)], new Set(), absolute);

    expect(preview[0]).toMatchObject({ x: 0, y: 0 });
  });
});
