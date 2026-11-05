import { DONE_VISIBLE_MS, NOTE_CARD_WIDTH, NOTE_COORD_MAX } from './note-constants';

/** Geometry and timing logic of the notes canvas. All pure functions, no DOM or Mongo. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Estimated card height (the real height depends on the text). Only used to find free spots. */
export const CARD_ESTIMATED_HEIGHT = 104;
const GAP = 16;
const MARGIN = 24;
const CANVAS_WIDTH = 1_240;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * First free spot, scanning rows left to right and top to bottom. `occupied` are the rectangles in
 * canvas coordinates (loose cards and groups). `canvasWidth` is the usable canvas width (1240 px by
 * default; the web app passes the real window width). Never fails: if the whole canvas were full,
 * the card goes at the end.
 */
export function nextFreePosition(
  occupied: readonly Rect[],
  size: { w: number; h: number } = { w: NOTE_CARD_WIDTH, h: CARD_ESTIMATED_HEIGHT },
  canvasWidth: number = CANVAS_WIDTH,
): Point {
  const stepX = size.w + GAP;
  const stepY = size.h + GAP;
  // Even if the window is narrower than a card, one column always fits.
  const width = Math.min(NOTE_COORD_MAX, Math.max(canvasWidth, MARGIN + size.w));
  const lastY = Math.max(MARGIN, ...occupied.map((r) => r.y + r.h)) + stepY;

  for (let y = MARGIN; y <= Math.min(lastY, NOTE_COORD_MAX); y += stepY) {
    for (let x = MARGIN; x + size.w <= width; x += stepX) {
      const candidate = { x, y, w: size.w, h: size.h };
      if (!occupied.some((r) => overlaps(candidate, r))) return { x, y };
    }
  }
  return { x: MARGIN, y: Math.min(lastY, NOTE_COORD_MAX) };
}

export interface Placeable extends Rect {
  id: string;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
}

/** Two items whose y differs by less than this are read as the same row. */
const ROW_TOLERANCE = Math.round(CARD_ESTIMATED_HEIGHT / 2);

/**
 * Reading order: top to bottom and, within each row, left to right. A row groups items that start at
 * almost the same height (less than half a card from the first one), so two notes that look aligned
 * are not ordered by a few pixels.
 */
export function readingOrder<T extends Point>(items: readonly T[]): T[] {
  const byY = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  let anchor = 0;
  for (const item of byY) {
    const row = rows[rows.length - 1];
    if (row && item.y - anchor < ROW_TOLERANCE) {
      row.push(item);
    } else {
      rows.push([item]);
      anchor = item.y;
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.y - b.y));
}

/**
 * Clean grid for the "Ordenar" (sort) action: places the items (loose cards and groups, with their
 * real or estimated height) in rows left to right and top to bottom, following their current reading
 * order. It keeps the standard margin and gap, nothing overlaps (each row is as tall as its tallest
 * item) and, if the canvas is narrower than the widest item, there is a single column.
 */
export function arrangeInGrid(items: readonly Placeable[], canvasWidth: number): Placement[] {
  const widest = items.reduce((max, item) => Math.max(max, item.w), 0);
  const width = Math.min(NOTE_COORD_MAX, Math.max(canvasWidth, MARGIN * 2 + widest));
  const placements: Placement[] = [];
  let x = MARGIN;
  let y = MARGIN;
  let rowHeight = 0;

  for (const item of readingOrder(items)) {
    if (x > MARGIN && x + item.w > width - MARGIN) {
      x = MARGIN;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    placements.push({ id: item.id, x: clampCoord(x), y: clampCoord(y) });
    x += item.w + GAP;
    rowHeight = Math.max(rowHeight, item.h);
  }
  return placements;
}

/** Coordinates of a card inside a group -> canvas coordinates. */
export function toAbsolute(point: Point, group: Point): Point {
  return { x: point.x + group.x, y: point.y + group.y };
}

/** Canvas coordinates -> group-relative, always within the allowed bounds. */
export function toRelative(point: Point, group: Point): Point {
  return {
    x: clampCoord(point.x - group.x),
    y: clampCoord(point.y - group.y),
  };
}

export function clampCoord(value: number): number {
  return Math.min(NOTE_COORD_MAX, Math.max(0, Math.round(value)));
}

/** Group under a canvas point. If several overlap, the last one in the list (the top one) wins. */
export function groupAtPoint<G extends Rect & { id: string }>(
  groups: readonly G[],
  point: Point,
  excludeId?: string,
): G | null {
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    if (group.id === excludeId) continue;
    if (
      point.x >= group.x &&
      point.x <= group.x + group.w &&
      point.y >= group.y &&
      point.y <= group.y + group.h
    ) {
      return group;
    }
  }
  return null;
}

/** Smallest rectangle containing all of them, with padding. Returns `null` if there are none. */
export function boundingBox(rects: readonly Rect[], padding = 0): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1 - padding, y: y1 - padding, w: x2 - x1 + padding * 2, h: y2 - y1 + padding * 2 };
}

/** Is it still visible? Open cards always; done cards for 24 h after `doneAt`. */
export function isVisible(doneAt: string | null, now: number): boolean {
  if (doneAt === null) return true;
  return now - Date.parse(doneAt) < DONE_VISIBLE_MS;
}

/** Milliseconds left before a done card is hidden (0 if it already expired). */
export function remainingMs(doneAt: string, now: number): number {
  return Math.max(0, Date.parse(doneAt) + DONE_VISIBLE_MS - now);
}

/** "21 h", "35 min" or "menos de 1 min" (less than 1 min). */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h`;
}

/**
 * Cards in a group are not placed freely: they are stacked one below the other. Their order comes
 * from `y` (then `x`, creation date and id), so existing data keeps a reasonable order without a
 * migration, and dropping a card at a point of the group leaves it there.
 */
export const STACK_STEP = 10;

export function stackOrder<T extends { id: string; x: number; y: number; createdAt: string }>(
  cards: readonly T[],
): T[] {
  return [...cards].sort(
    (a, b) =>
      a.y - b.y || a.x - b.x || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** `y` of position `index` in the stack (positions go in steps of STACK_STEP). */
export function stackY(index: number): number {
  return clampCoord(index * STACK_STEP);
}

/** `y` for a card added at the end of the stack. */
export function stackEndY(members: readonly { y: number }[]): number {
  return members.length === 0 ? 0 : clampCoord(Math.max(...members.map((m) => m.y)) + STACK_STEP);
}
