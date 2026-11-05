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

/** Free space kept between the canvas border and what is dragged or resized inside it. */
export const BOARD_PADDING = 8;

/**
 * Where a drag may go. `area` is the visible canvas (its width and height when the drag started);
 * `extent` is everything that moves together (the selected cards, or the group), at the start.
 * Nothing can be dragged out of the area, and it keeps BOARD_PADDING from every border.
 */
export interface DragLimits {
  area: { w: number; h: number };
  extent: Rect;
}

/** `delta` cut so an item at `from` with length `size` stays inside [padding, max - padding]. */
function fitDelta(delta: number, from: number, size: number, max: number): number {
  const lowest = BOARD_PADDING - from;
  const highest = max - BOARD_PADDING - (from + size);
  // An extent bigger than the area cannot fit: it goes to the top/left.
  return highest < lowest ? lowest : Math.min(highest, Math.max(lowest, delta));
}

/** Free space kept between two groups when one is moved or resized against the other. */
export const GROUP_GAP = 16;

/** True if `a` is closer than `gap` to `b` (or overlaps it). */
function tooClose(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
  );
}

/**
 * Size a group can take when resized from its top-left corner (which stays put): the requested
 * size, cut where it would reach another group (keeping GROUP_GAP). A group it already touches is
 * ignored, and a cut never shrinks the group below the size it started with.
 */
export function resizeAvoiding(
  origin: Rect,
  size: { w: number; h: number },
  others: readonly Rect[],
): { w: number; h: number } {
  let { w, h } = size;
  for (let pass = 0; pass < 2; pass++) {
    for (const other of others) {
      if (tooClose(origin, other, 0)) continue;
      if (!tooClose({ x: origin.x, y: origin.y, w, h }, other, GROUP_GAP)) continue;
      const rightOf = other.x >= origin.x + origin.w;
      const below = other.y >= origin.y + origin.h;
      const wLimit = other.x - GROUP_GAP - origin.x;
      const hLimit = other.y - GROUP_GAP - origin.y;
      // Cut the axis that loses less when the other group is diagonal to this one.
      const cutW = rightOf && (!below || w - wLimit <= h - hLimit);
      if (cutW) w = Math.min(w, Math.max(wLimit, origin.w));
      else if (below) h = Math.min(h, Math.max(hLimit, origin.h));
    }
  }
  return { w, h };
}

/**
 * Where a group dragged from `from` can go to reach `to`: axis by axis (x first), stopping
 * GROUP_GAP short of any group in the way. Groups it already touches are ignored.
 */
export function moveAvoiding(from: Rect, to: Point, others: readonly Rect[]): Point {
  let x = to.x;
  for (const o of others) {
    if (tooClose(from, o, 0)) continue;
    const sameRow = from.y < o.y + o.h + GROUP_GAP && from.y + from.h + GROUP_GAP > o.y;
    if (!sameRow) continue;
    if (x > from.x && o.x >= from.x + from.w) {
      x = Math.min(x, Math.max(from.x, o.x - GROUP_GAP - from.w));
    } else if (x < from.x && o.x + o.w <= from.x) {
      x = Math.max(x, Math.min(from.x, o.x + o.w + GROUP_GAP));
    }
  }
  let y = to.y;
  for (const o of others) {
    if (tooClose(from, o, 0)) continue;
    const sameColumn = x < o.x + o.w + GROUP_GAP && x + from.w + GROUP_GAP > o.x;
    if (!sameColumn) continue;
    if (y > from.y && o.y >= from.y + from.h) {
      y = Math.min(y, Math.max(from.y, o.y - GROUP_GAP - from.h));
    } else if (y < from.y && o.y + o.h <= from.y) {
      y = Math.max(y, Math.min(from.y, o.y + o.h + GROUP_GAP));
    }
  }
  return { x, y };
}

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
export function advanceDrag(
  drag: Drag,
  pointer: Point,
  groups: readonly NoteGroup[],
  limits?: DragLimits,
): Drag {
  let dx = pointer.x - drag.startX;
  let dy = pointer.y - drag.startY;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return drag;
  if (limits && drag.kind !== 'resize') {
    const { area, extent } = limits;
    dx = fitDelta(dx, extent.x, extent.w, area.w);
    dy = fitDelta(dy, extent.y, extent.h, area.h);
  }

  // A group never overlaps another one: it stops against it, leaving GROUP_GAP.
  const others = drag.kind === 'card' ? [] : groups.filter((g) => g.id !== drag.id);

  if (drag.kind === 'resize') {
    // The group's top-left corner stays put: it can only grow up to the area's border.
    const maxW = limits ? limits.area.w - BOARD_PADDING - drag.originX : Infinity;
    const maxH = limits ? limits.area.h - BOARD_PADDING - drag.originY : Infinity;
    const size = resizeAvoiding(
      { x: drag.originX, y: drag.originY, w: drag.originW, h: drag.originH },
      {
        w: Math.max(MIN_GROUP, Math.min(maxW, clampCoord(drag.originW + dx))),
        h: Math.max(MIN_GROUP, Math.min(maxH, clampCoord(drag.originH + dy))),
      },
      others,
    );
    return { ...drag, moved: true, ...size };
  }

  let x = clampCoord(drag.originX + dx);
  let y = clampCoord(drag.originY + dy);
  if (drag.kind === 'group') {
    ({ x, y } = moveAvoiding({ x: drag.x, y: drag.y, w: drag.w, h: drag.h }, { x, y }, others));
  }
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
