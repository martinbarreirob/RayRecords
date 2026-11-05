import {
  CARD_ESTIMATED_HEIGHT,
  type Placeable,
  isVisible,
  nextFreePosition,
  type NoteCard,
  type Rect,
} from '@rayrecords/shared';

/** Pure logic of the notes screen (no DOM or Angular), so it can be tested on its own. */

/** First line as the card title and the rest as a secondary body. */
export function splitNoteText(text: string): { title: string; body: string } {
  const trimmed = text.replace(/^\s*\n/, '');
  const newline = trimmed.indexOf('\n');
  if (newline === -1) return { title: trimmed.trim(), body: '' };
  return { title: trimmed.slice(0, newline).trim(), body: trimmed.slice(newline + 1).trim() };
}

/** Do two rectangles overlap? Touching only at the edge does not count. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Rectangle between two points, whichever order they come in (for the selection marquee). */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Ids of the rectangles the marquee touches, added to those already selected. */
export function idsTouchedBy(
  frame: Rect,
  items: readonly { id: string; rect: Rect }[],
  base: ReadonlySet<string> = new Set(),
): Set<string> {
  const result = new Set(base);
  for (const item of items) if (rectsIntersect(frame, item.rect)) result.add(item.id);
  return result;
}

/**
 * "Finished" cards: those no longer shown on the canvas (done more than 24 h ago). Merges those
 * requested from the server with those that just expired in memory, without repeats, most recent first.
 */
export function mergeFinished(
  cards: readonly NoteCard[],
  fromServer: readonly NoteCard[] | null,
  now: number,
): NoteCard[] {
  const byId = new Map<string, NoteCard>();
  for (const card of fromServer ?? []) byId.set(card.id, card);
  for (const card of cards) {
    if (card.doneAt !== null && !isVisible(card.doneAt, now)) byId.set(card.id, card);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.doneAt ?? '') - Date.parse(a.doneAt ?? ''));
}

export function selectionLabel(count: number): string {
  return count === 1 ? '1 seleccionada' : `${count} seleccionadas`;
}

const dayFormat = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** «Miércoles, 4 de noviembre». */
export function formatNoteDate(date: Date): string {
  const text = dayFormat.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const stampFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** «3 nov, 10:42». */
export function formatStamp(iso: string): string {
  return stampFormat.format(new Date(iso));
}

/** Keyboard move step, in px. */
export const KEY_STEP = 16;

/**
 * Offset for an arrow key press that moves the selected cards: only Shift+arrow. Alt+arrow is global
 * navigation between sections and Ctrl/Meta+Shift+arrow selects text, so with either nothing moves
 * (and the screen must not cancel the key press).
 */
export function arrowMove(event: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): { dx: number; dy: number } | null {
  if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case 'ArrowLeft':
      return { dx: -KEY_STEP, dy: 0 };
    case 'ArrowRight':
      return { dx: KEY_STEP, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -KEY_STEP };
    case 'ArrowDown':
      return { dx: 0, dy: KEY_STEP };
    default:
      return null;
  }
}

/** Height of a loose card, for finding gaps and measuring the canvas. */
const CARD_HEIGHT = CARD_ESTIMATED_HEIGHT;

/** Occupied rectangles of the canvas (loose cards and groups), in canvas coordinates. */
export function occupiedRects(
  loose: readonly Pick<NoteCard, 'x' | 'y' | 'w'>[],
  groups: readonly Rect[],
): Rect[] {
  return [
    ...loose.map((card) => ({ x: card.x, y: card.y, w: card.w, h: CARD_HEIGHT })),
    ...groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
  ];
}

/** First free slot for a new card on a canvas as wide as the real window. */
export function freeSlot(
  loose: readonly Pick<NoteCard, 'x' | 'y' | 'w'>[],
  groups: readonly Rect[],
  canvasWidth: number,
): { x: number; y: number } {
  return nextFreePosition(occupiedRects(loose, groups), undefined, canvasWidth);
}

/** Right edge of the farthest thing on the canvas (0 if empty). */
export function rightEdge(
  loose: readonly Pick<NoteCard, 'x' | 'w'>[],
  groups: readonly Pick<Rect, 'x' | 'w'>[],
): number {
  return Math.max(0, ...loose.map((c) => c.x + c.w), ...groups.map((g) => g.x + g.w));
}

/**
 * Items that go into «Ordenar»: loose cards (with their real height if known; otherwise the
 * estimate) and groups. Cards inside a group travel with it and do not count.
 */
export function arrangeItems(
  loose: readonly Pick<NoteCard, 'id' | 'x' | 'y' | 'w'>[],
  groups: readonly (Rect & { id: string })[],
  heights: ReadonlyMap<string, number> = new Map(),
): Placeable[] {
  return [
    ...loose.map((card) => ({
      id: card.id,
      x: card.x,
      y: card.y,
      w: card.w,
      h: heights.get(card.id) || CARD_HEIGHT,
    })),
    ...groups.map((g) => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h })),
  ];
}
