import { describe, expect, it } from 'vitest';
import {
  arrangeInGrid,
  boundingBox,
  formatDuration,
  groupAtPoint,
  isVisible,
  nextFreePosition,
  readingOrder,
  remainingMs,
  STACK_STEP,
  stackEndY,
  stackOrder,
  stackY,
  toAbsolute,
  toRelative,
} from './note-layout';
import { DONE_VISIBLE_MS, NOTE_COORD_MAX } from './note-constants';

const HOUR = 3_600_000;

describe('nextFreePosition', () => {
  it('with nothing placed, uses the corner with margin', () => {
    expect(nextFreePosition([])).toEqual({ x: 24, y: 24 });
  });

  it('moves right if the first spot is taken', () => {
    const pos = nextFreePosition([{ x: 24, y: 24, w: 280, h: 104 }]);
    expect(pos).toEqual({ x: 320, y: 24 });
  });

  it('moves to the next row when the first is full', () => {
    const row = [24, 320, 616, 912].map((x) => ({ x, y: 24, w: 280, h: 104 }));
    expect(nextFreePosition(row)).toEqual({ x: 24, y: 144 });
  });

  it('avoids a large group', () => {
    const pos = nextFreePosition([{ x: 0, y: 0, w: 700, h: 400 }]);
    expect(pos.x).toBeGreaterThanOrEqual(700);
  });

  it('with a wider canvas, the first row fits more cards', () => {
    const row = [24, 320, 616, 912].map((x) => ({ x, y: 24, w: 280, h: 104 }));
    expect(nextFreePosition(row, undefined, 1_700)).toEqual({ x: 1_208, y: 24 });
  });

  it('with a narrow canvas, wraps to the next row sooner', () => {
    const row = [{ x: 24, y: 24, w: 280, h: 104 }];
    expect(nextFreePosition(row, undefined, 590)).toEqual({ x: 24, y: 144 });
  });

  it('even if the window is narrower than a card, one column fits', () => {
    expect(nextFreePosition([], undefined, 100)).toEqual({ x: 24, y: 24 });
  });

  it('never goes out of bounds', () => {
    const full = [{ x: 0, y: 0, w: 2_000, h: NOTE_COORD_MAX + 500 }];
    const pos = nextFreePosition(full);
    expect(pos.y).toBeLessThanOrEqual(NOTE_COORD_MAX);
    expect(pos.x).toBeGreaterThanOrEqual(0);
  });
});

describe('group coordinates', () => {
  const group = { x: 100, y: 200 };

  it('round trip between relative and absolute', () => {
    const abs = toAbsolute({ x: 10, y: 20 }, group);
    expect(abs).toEqual({ x: 110, y: 220 });
    expect(toRelative(abs, group)).toEqual({ x: 10, y: 20 });
  });

  it('relative coordinates are never negative', () => {
    expect(toRelative({ x: 50, y: 150 }, group)).toEqual({ x: 0, y: 0 });
  });
});

describe('groupAtPoint', () => {
  const groups = [
    { id: 'a', x: 0, y: 0, w: 400, h: 400 },
    { id: 'b', x: 100, y: 100, w: 100, h: 100 },
  ];

  it('returns the top group when they overlap', () => {
    expect(groupAtPoint(groups, { x: 150, y: 150 })?.id).toBe('b');
  });

  it('can exclude the group being dragged', () => {
    expect(groupAtPoint(groups, { x: 150, y: 150 }, 'b')?.id).toBe('a');
  });

  it('returns null outside any group', () => {
    expect(groupAtPoint(groups, { x: 900, y: 900 })).toBeNull();
  });
});

describe('boundingBox', () => {
  it('wraps the rectangles with padding', () => {
    const box = boundingBox(
      [
        { x: 10, y: 10, w: 100, h: 50 },
        { x: 200, y: 100, w: 100, h: 50 },
      ],
      8,
    );
    expect(box).toEqual({ x: 2, y: 2, w: 306, h: 156 });
  });

  it('returns null without rectangles', () => {
    expect(boundingBox([])).toBeNull();
  });
});

describe('done cards: hidden after 24 h', () => {
  const doneAt = '2026-11-04T10:00:00.000Z';
  const t0 = Date.parse(doneAt);

  it('open cards are always visible', () => {
    expect(isVisible(null, t0 + 1000 * HOUR)).toBe(true);
  });

  it('a done card is visible just before 24 h', () => {
    expect(isVisible(doneAt, t0 + DONE_VISIBLE_MS - 1)).toBe(true);
  });

  it('a done card is hidden exactly at 24 h', () => {
    expect(isVisible(doneAt, t0 + DONE_VISIBLE_MS)).toBe(false);
  });

  it('computes the remaining time without going below zero', () => {
    expect(remainingMs(doneAt, t0 + 3 * HOUR)).toBe(21 * HOUR);
    expect(remainingMs(doneAt, t0 + 30 * HOUR)).toBe(0);
  });

  it('formats the duration', () => {
    expect(formatDuration(21 * HOUR)).toBe('21 h');
    expect(formatDuration(35 * 60_000)).toBe('35 min');
    expect(formatDuration(10_000)).toBe('menos de 1 min');
  });
});

describe('readingOrder', () => {
  it('orders by row and, within a row, left to right', () => {
    const items = [
      { id: 'd', x: 500, y: 300 },
      { id: 'b', x: 500, y: 20 },
      { id: 'a', x: 10, y: 24 },
      { id: 'c', x: 10, y: 310 },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('two almost aligned notes count as the same row', () => {
    const items = [
      { id: 'derecha', x: 400, y: 20 },
      { id: 'izquierda', x: 10, y: 60 },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['izquierda', 'derecha']);
  });

  it('does not modify the original list', () => {
    const items = [
      { id: 'b', x: 0, y: 200 },
      { id: 'a', x: 0, y: 0 },
    ];
    readingOrder(items);
    expect(items[0]!.id).toBe('b');
  });
});

describe('arrangeInGrid', () => {
  const card = (id: string, x: number, y: number, h = 104) => ({ id, x, y, w: 280, h });

  function noOverlap(
    items: { id: string; w: number; h: number }[],
    placed: { id: string; x: number; y: number }[],
  ) {
    const rects = placed.map((p) => {
      const item = items.find((i) => i.id === p.id)!;
      return { id: p.id, x: p.x, y: p.y, w: item.w, h: item.h };
    });
    for (const a of rects) {
      for (const b of rects) {
        if (a.id === b.id) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} solapa con ${b.id}`).toBe(false);
      }
    }
  }

  it('returns nothing without items', () => {
    expect(arrangeInGrid([], 1_120)).toEqual([]);
  });

  it('starts at the top left and follows the reading order', () => {
    const items = [card('c', 600, 400), card('a', 700, 30), card('b', 20, 36)];
    const placed = arrangeInGrid(items, 1_120);
    expect(placed.map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(placed[0]).toEqual({ id: 'b', x: 24, y: 24 });
    expect(placed[1]).toEqual({ id: 'a', x: 320, y: 24 });
  });

  it('wraps to the next row when the width runs out (3 columns in 1120 px)', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => card(id, i * 10, 0));
    const placed = arrangeInGrid(items, 1_120);
    expect(placed.map((p) => [p.x, p.y])).toEqual([
      [24, 24],
      [320, 24],
      [616, 24],
      [24, 144],
      [320, 144],
    ]);
    noOverlap(items, placed);
  });

  it('with a narrow canvas leaves a single column', () => {
    const items = [card('a', 0, 0), card('b', 10, 10), card('c', 20, 20)];
    const placed = arrangeInGrid(items, 200);
    expect(placed.map((p) => p.x)).toEqual([24, 24, 24]);
    expect(placed.map((p) => p.y)).toEqual([24, 144, 264]);
  });

  it('each row is as tall as its tallest item (cards with long text and groups)', () => {
    const items = [
      card('alta', 0, 0, 220),
      { id: 'grupo', x: 300, y: 0, w: 420, h: 300 },
      card('x', 0, 400),
      card('y', 300, 400),
      card('z', 600, 400),
    ];
    const placed = arrangeInGrid(items, 1_120);
    noOverlap(items, placed);
    const byId = new Map(placed.map((p) => [p.id, p]));
    expect(byId.get('alta')).toEqual({ id: 'alta', x: 24, y: 24 });
    expect(byId.get('grupo')).toEqual({ id: 'grupo', x: 320, y: 24 });
    // The third still fits in the first row; the fourth goes below the group, which is the tallest (300).
    expect(byId.get('x')).toEqual({ id: 'x', x: 756, y: 24 });
    expect(byId.get('y')).toEqual({ id: 'y', x: 24, y: 24 + 300 + 16 });
  });

  it('nothing overlaps with many mixed items', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      i % 7 === 0
        ? { id: `g${i}`, x: (i * 53) % 900, y: (i * 37) % 700, w: 420, h: 300 }
        : { id: `c${i}`, x: (i * 91) % 900, y: (i * 61) % 700, w: 280, h: 104 + (i % 3) * 40 },
    );
    for (const width of [320, 700, 1_120, 1_900]) {
      const placed = arrangeInGrid(items, width);
      expect(placed).toHaveLength(items.length);
      noOverlap(items, placed);
      // Never goes past the right edge (unless it is a single column wider than the canvas).
      for (const p of placed) {
        const w = items.find((i) => i.id === p.id)!.w;
        expect(p.x + w).toBeLessThanOrEqual(Math.max(width, 24 * 2 + 420) - 24);
      }
    }
  });

  it('is stable: arranging what is already arranged changes nothing', () => {
    const items = [card('a', 0, 0), card('b', 5, 5), card('c', 9, 400), card('d', 3, 410, 150)];
    const once = arrangeInGrid(items, 1_120);
    const moved = items.map((item) => ({ ...item, ...once.find((p) => p.id === item.id)! }));
    expect(arrangeInGrid(moved, 1_120)).toEqual(once);
  });
});

describe('group stack', () => {
  const card = (id: string, x: number, y: number, createdAt = '2026-11-01T10:00:00.000Z') => ({
    id,
    x,
    y,
    createdAt,
  });

  it('orders by y, then x, then date and finally id', () => {
    const ordered = stackOrder([
      card('d', 0, 50, '2026-11-02T10:00:00.000Z'),
      card('c', 0, 50, '2026-11-01T10:00:00.000Z'),
      card('b', 5, 20),
      card('a', 0, 20),
    ]);

    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not modify the original list', () => {
    const list = [card('b', 0, 20), card('a', 0, 10)];

    stackOrder(list);

    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('stack position advances in steps of STACK_STEP and is clamped', () => {
    expect(stackY(0)).toBe(0);
    expect(stackY(3)).toBe(3 * STACK_STEP);
    expect(stackY(1_000_000)).toBe(NOTE_COORD_MAX);
  });

  it('the end of the stack goes after the last card', () => {
    expect(stackEndY([])).toBe(0);
    expect(stackEndY([{ y: 56 }, { y: 20 }])).toBe(56 + STACK_STEP);
  });
});
