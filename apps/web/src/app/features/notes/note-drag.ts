import {
  CARD_ESTIMATED_HEIGHT,
  boundingBox,
  clampCoord,
  groupAtPoint,
  stackOrder,
  stackY,
  type NoteCard,
  type NoteGroup,
  type Point,
  type Rect,
} from '@rayrecords/shared';

/** State of a drag in progress and its rules. All pure functions, no DOM. */

export interface Drag {
  kind: 'card' | 'group' | 'resize';
  /** Card or group being dragged. */
  id: string;
  /** Pointer at the start. */
  startX: number;
  startY: number;
  /** Starting position and size, in canvas coordinates. */
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  /** Current position and size while dragging. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Group the dragged card drops onto. */
  over: string | null;
  moved: boolean;
  additive: boolean;
}

export const MIN_GROUP = 160;
/**
 * Below this distance (sum of |dx| and |dy|) it is a click, not a drag. Deliberately generous:
 * a click with a slight hand tremor must not move the card.
 */
export const DRAG_THRESHOLD = 8;

export function startDrag(
  kind: Drag['kind'],
  id: string,
  pointer: Point,
  box: Rect,
  additive = false,
): Drag {
  return {
    kind,
    id,
    startX: pointer.x,
    startY: pointer.y,
    originX: box.x,
    originY: box.y,
    originW: box.w,
    originH: box.h,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    over: null,
    moved: false,
    additive,
  };
}

/** New drag state with the pointer at `pointer`. A minimal movement does not count. */
export function advanceDrag(drag: Drag, pointer: Point, groups: readonly NoteGroup[]): Drag {
  const dx = pointer.x - drag.startX;
  const dy = pointer.y - drag.startY;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return drag;

  if (drag.kind === 'resize') {
    return {
      ...drag,
      moved: true,
      w: Math.max(MIN_GROUP, clampCoord(drag.originW + dx)),
      h: Math.max(MIN_GROUP, clampCoord(drag.originH + dy)),
    };
  }

  const x = clampCoord(drag.originX + dx);
  const y = clampCoord(drag.originY + dy);
  // The card drops into the group under its centre.
  const over =
    drag.kind === 'card'
      ? (groupAtPoint(groups, { x: x + drag.w / 2, y: y + 24 })?.id ?? null)
      : null;
  return { ...drag, moved: true, x, y, over };
}

export interface CardMove {
  id: string;
  x: number;
  y: number;
  groupId: string | null;
}

/** Cards that travel with the drag: the whole selection if it includes the grabbed one; otherwise only it. */
export function draggedIds(drag: Drag, selected: ReadonlySet<string>): ReadonlySet<string> {
  return selected.has(drag.id) ? selected : new Set([drag.id]);
}

/**
 * How the cards look while dragged: each at its place on the canvas plus the drag offset. They come
 * out loose (no group) because they are painted above the whole canvas.
 */
export function dragPreview(
  drag: Drag,
  cards: readonly NoteCard[],
  selected: ReadonlySet<string>,
  absolute: (card: NoteCard) => Point,
): NoteCard[] {
  const dx = drag.x - drag.originX;
  const dy = drag.y - drag.originY;
  const ids = draggedIds(drag, selected);
  return cards
    .filter((card) => ids.has(card.id))
    .map((card) => {
      const abs = absolute(card);
      return { ...card, x: clampCoord(abs.x + dx), y: clampCoord(abs.y + dy), groupId: null };
    });
}

/**
 * Moves on drop: the dragged card and the rest of the selection shift by the same amount.
 * `absolute` gives each card's canvas position. If it lands on a group, they become its own and are
 * placed in its stack (see `stackOrder`) by the height they are dropped at, among those already
 * there; the `y` of those that change place is reassigned and `x` becomes 0. Otherwise they stay loose.
 * `heightOf` gives a card's real height (by default, the estimate).
 */
export function dropMoves(
  drag: Drag,
  cards: readonly NoteCard[],
  selected: ReadonlySet<string>,
  groups: readonly NoteGroup[],
  absolute: (card: NoteCard) => Point,
  heightOf: (card: NoteCard) => number = () => CARD_ESTIMATED_HEIGHT,
): CardMove[] {
  const target = drag.over ? groups.find((g) => g.id === drag.over) : undefined;
  const preview = dragPreview(drag, cards, selected, absolute);

  if (!target) {
    return preview.map((card) => ({ id: card.id, x: card.x, y: card.y, groupId: null }));
  }

  const carried = new Set(preview.map((card) => card.id));
  const members = stackOrder(cards.filter((c) => c.groupId === target.id && !carried.has(c.id)));
  const grabbed = cards.find((c) => c.id === drag.id);
  const dropCenter = drag.y + (grabbed ? heightOf(grabbed) : CARD_ESTIMATED_HEIGHT) / 2;
  const index = members.filter((m) => absolute(m).y + heightOf(m) / 2 < dropCenter).length;
  const dropped = [...preview].sort((a, b) => a.y - b.y || a.x - b.x);

  const final = [...members.slice(0, index), ...dropped, ...members.slice(index)];
  const moves: CardMove[] = [];
  final.forEach((card, position) => {
    const y = stackY(position);
    if (carried.has(card.id) || card.y !== y) {
      moves.push({ id: card.id, x: 0, y, groupId: target.id });
    }
  });
  return moves;
}

/** Rectangle of the new group wrapping these cards: margin around and room for the title. */
export function groupAround(
  cards: readonly NoteCard[],
  absolute: (card: NoteCard) => Point,
): { rects: Rect[]; group: Rect } | null {
  const rects = cards.map((card) => {
    const abs = absolute(card);
    return { x: abs.x, y: abs.y, w: card.w, h: CARD_ESTIMATED_HEIGHT };
  });
  const box = boundingBox(rects);
  if (!box) return null;
  return {
    rects,
    group: {
      x: clampCoord(box.x - 16),
      y: clampCoord(box.y - 56),
      w: Math.max(MIN_GROUP, clampCoord(box.w + 32)),
      h: Math.max(MIN_GROUP, clampCoord(box.h + 72)),
    },
  };
}
