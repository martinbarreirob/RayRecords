import { DONE_VISIBLE_MS, type NoteCard } from '@rayrecords/shared';
import {
  KEY_STEP,
  arrangeItems,
  arrowMove,
  formatNoteDate,
  freeSlot,
  idsTouchedBy,
  mergeFinished,
  occupiedRects,
  rectBetween,
  rectsIntersect,
  rightEdge,
  selectionLabel,
  splitNoteText,
} from './note-board.logic';

const stamp = '2026-11-04T09:00:00.000Z';
const NOW = Date.parse('2026-11-04T12:00:00.000Z');

function card(id: string, doneAt: string | null): NoteCard {
  return {
    id,
    text: id,
    x: 0,
    y: 0,
    w: 280,
    z: 0,
    groupId: null,
    doneAt,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('splitNoteText', () => {
  it('the first line is the title and the rest the body', () => {
    expect(
      splitNoteText('Llamar al fontanero\nAntes de las 12.\nPreguntar por el desagüe'),
    ).toEqual({
      title: 'Llamar al fontanero',
      body: 'Antes de las 12.\nPreguntar por el desagüe',
    });
  });

  it('a single line has no body', () => {
    expect(splitNoteText('  Elegir grifería ')).toEqual({ title: 'Elegir grifería', body: '' });
  });

  it('empty text gives empty title and body', () => {
    expect(splitNoteText('')).toEqual({ title: '', body: '' });
  });

  it('ignores blank lines at the start', () => {
    expect(splitNoteText('\nHola\nmundo')).toEqual({ title: 'Hola', body: 'mundo' });
  });
});

describe('selection marquee', () => {
  it('rectBetween orders the corners even when dragging up and to the left', () => {
    expect(rectBetween({ x: 100, y: 80 }, { x: 40, y: 20 })).toEqual({
      x: 40,
      y: 20,
      w: 60,
      h: 60,
    });
  });

  it('rectsIntersect tells apart overlap, touching at the edge and separate', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
    expect(rectsIntersect(a, { x: 100, y: 0, w: 50, h: 50 })).toBe(false);
    expect(rectsIntersect(a, { x: 200, y: 200, w: 10, h: 10 })).toBe(false);
  });

  it('idsTouchedBy adds what the marquee touches to what was already selected', () => {
    const items = [
      { id: 'a', rect: { x: 0, y: 0, w: 50, h: 50 } },
      { id: 'b', rect: { x: 300, y: 300, w: 50, h: 50 } },
      { id: 'c', rect: { x: 40, y: 40, w: 50, h: 50 } },
    ];
    const frame = { x: 20, y: 20, w: 40, h: 40 };

    expect([...idsTouchedBy(frame, items)]).toEqual(['a', 'c']);
    expect([...idsTouchedBy(frame, items, new Set(['b']))].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeFinished', () => {
  const old = new Date(NOW - DONE_VISIBLE_MS - 60_000).toISOString();
  const older = new Date(NOW - DONE_VISIBLE_MS - 3_600_000).toISOString();
  const recent = new Date(NOW - 60_000).toISOString();

  it('merges the server ones with those that just expired, without repeats', () => {
    const fromServer = [card('s1', older), card('s2', old)];
    const inMemory = [
      card('s2', old),
      card('m1', old),
      card('visible', recent),
      card('open', null),
    ];

    const result = mergeFinished(inMemory, fromServer, NOW).map((c) => c.id);

    expect(result.sort()).toEqual(['m1', 's1', 's2']);
  });

  it('sorts from most recent to oldest', () => {
    const result = mergeFinished([], [card('viejo', older), card('nuevo', old)], NOW);

    expect(result.map((c) => c.id)).toEqual(['nuevo', 'viejo']);
  });

  it('with no server response only counts what expired in memory', () => {
    expect(mergeFinished([card('m1', old), card('v', recent)], null, NOW)).toHaveLength(1);
  });
});

describe('texts', () => {
  it('agrees the number in «seleccionada(s)»', () => {
    expect(selectionLabel(1)).toBe('1 seleccionada');
    expect(selectionLabel(3)).toBe('3 seleccionadas');
  });

  it('gives the date with a capital initial', () => {
    expect(formatNoteDate(new Date(2026, 10, 4))).toBe('Miércoles, 4 de noviembre');
  });
});

describe('arrowMove', () => {
  const base = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false };

  it('Shift+arrow moves one step in the arrow direction', () => {
    expect(arrowMove({ ...base, key: 'ArrowLeft' })).toEqual({ dx: -KEY_STEP, dy: 0 });
    expect(arrowMove({ ...base, key: 'ArrowRight' })).toEqual({ dx: KEY_STEP, dy: 0 });
    expect(arrowMove({ ...base, key: 'ArrowUp' })).toEqual({ dx: 0, dy: -KEY_STEP });
    expect(arrowMove({ ...base, key: 'ArrowDown' })).toEqual({ dx: 0, dy: KEY_STEP });
  });

  it('a bare arrow moves nothing (it scrolls the page)', () => {
    expect(arrowMove({ ...base, shiftKey: false, key: 'ArrowLeft' })).toBeNull();
  });

  it('Alt+arrow belongs to global navigation: not touched, not even with Shift', () => {
    expect(arrowMove({ ...base, shiftKey: false, altKey: true, key: 'ArrowRight' })).toBeNull();
    expect(arrowMove({ ...base, altKey: true, key: 'ArrowLeft' })).toBeNull();
  });

  it('with Ctrl or Meta neither, and other keys are ignored', () => {
    expect(arrowMove({ ...base, ctrlKey: true, key: 'ArrowUp' })).toBeNull();
    expect(arrowMove({ ...base, metaKey: true, key: 'ArrowDown' })).toBeNull();
    expect(arrowMove({ ...base, key: 'a' })).toBeNull();
  });
});

describe('free slot and canvas extent', () => {
  it('loose cards (with estimated height) and groups take up space', () => {
    const rects = occupiedRects([{ x: 10, y: 20, w: 280 }], [{ x: 0, y: 0, w: 400, h: 300 }]);

    expect(rects).toEqual([
      { x: 10, y: 20, w: 280, h: 104 },
      { x: 0, y: 0, w: 400, h: 300 },
    ]);
  });

  it('the slot uses the real width: in a wide window the row fits more cards', () => {
    const row = [24, 320, 616, 912].map((x) => ({ x, y: 24, w: 280 }));

    expect(freeSlot(row, [], 1_240)).toEqual({ x: 24, y: 144 });
    expect(freeSlot(row, [], 1_800)).toEqual({ x: 1_208, y: 24 });
  });

  it('the right edge is that of the farthest item, card or group', () => {
    expect(rightEdge([], [])).toBe(0);
    expect(rightEdge([{ x: 2_000, w: 280 }], [{ x: 100, w: 420 }])).toBe(2_280);
    expect(rightEdge([{ x: 10, w: 280 }], [{ x: 3_000, w: 420 }])).toBe(3_420);
  });
});

describe('arrangeItems', () => {
  it('joins loose cards and groups, with the real height if known and the estimate if not', () => {
    const items = arrangeItems(
      [
        { id: 'a', x: 10, y: 20, w: 280 },
        { id: 'b', x: 300, y: 20, w: 280 },
      ],
      [{ id: 'g', x: 0, y: 200, w: 420, h: 300 }],
      new Map([['a', 150]]),
    );

    expect(items).toEqual([
      { id: 'a', x: 10, y: 20, w: 280, h: 150 },
      { id: 'b', x: 300, y: 20, w: 280, h: 104 },
      { id: 'g', x: 0, y: 200, w: 420, h: 300 },
    ]);
  });

  it('with nothing there are no items', () => {
    expect(arrangeItems([], [])).toEqual([]);
  });
});
