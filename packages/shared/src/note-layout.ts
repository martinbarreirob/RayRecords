import { DONE_VISIBLE_MS, NOTE_CARD_WIDTH, NOTE_COORD_MAX } from './note-constants';

/** Lógica geométrica y temporal del lienzo de notas. Todo son funciones puras, sin DOM ni Mongo. */

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

/** Alto estimado de una tarjeta (su alto real depende del texto). Solo sirve para buscar huecos. */
export const CARD_ESTIMATED_HEIGHT = 104;
const GAP = 16;
const MARGIN = 24;
const CANVAS_WIDTH = 1_240;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Primer hueco libre, en filas de izquierda a derecha y de arriba abajo. `occupied` son los
 * rectángulos en coordenadas del lienzo (tarjetas sueltas y grupos). `canvasWidth` es el ancho útil
 * del lienzo (por defecto 1240 px; la web pasa el ancho real de la ventana). Nunca falla: si todo el
 * lienzo estuviera lleno, coloca la tarjeta al final.
 */
export function nextFreePosition(
  occupied: readonly Rect[],
  size: { w: number; h: number } = { w: NOTE_CARD_WIDTH, h: CARD_ESTIMATED_HEIGHT },
  canvasWidth: number = CANVAS_WIDTH,
): Point {
  const stepX = size.w + GAP;
  const stepY = size.h + GAP;
  // Aunque la ventana sea más estrecha que una tarjeta, siempre cabe una columna.
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

/** Dos elementos cuya y difiere menos que esto se leen como de la misma fila. */
const ROW_TOLERANCE = Math.round(CARD_ESTIMATED_HEIGHT / 2);

/**
 * Orden de lectura: de arriba abajo y, dentro de cada fila, de izquierda a derecha. Una fila agrupa
 * lo que empieza a una altura casi igual (menos de media tarjeta de diferencia con el primero), para
 * que dos notas «alineadas a ojo» no se ordenen por unos píxeles de más o de menos.
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
 * Rejilla limpia para «Ordenar»: coloca los elementos (tarjetas sueltas y grupos, con su alto real
 * o estimado) en filas de izquierda a derecha y de arriba abajo, siguiendo su orden de lectura actual.
 * Respeta el margen y el hueco estándar, no se solapa nada (cada fila mide lo que el más alto) y, si
 * el lienzo es más estrecho que el elemento más ancho, queda una sola columna.
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

/** Coordenadas de una tarjeta de un grupo → coordenadas del lienzo. */
export function toAbsolute(point: Point, group: Point): Point {
  return { x: point.x + group.x, y: point.y + group.y };
}

/** Coordenadas del lienzo → relativas al grupo, sin salirse nunca de los límites permitidos. */
export function toRelative(point: Point, group: Point): Point {
  return {
    x: clampCoord(point.x - group.x),
    y: clampCoord(point.y - group.y),
  };
}

export function clampCoord(value: number): number {
  return Math.min(NOTE_COORD_MAX, Math.max(0, Math.round(value)));
}

/** Grupo bajo un punto del lienzo. Si hay varios solapados, gana el último de la lista (el de encima). */
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

/** Rectángulo mínimo que contiene a todos, con margen. Devuelve `null` si no hay ninguno. */
export function boundingBox(rects: readonly Rect[], padding = 0): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1 - padding, y: y1 - padding, w: x2 - x1 + padding * 2, h: y2 - y1 + padding * 2 };
}

/** ¿Sigue visible? Las tarjetas sin hacer siempre; las hechas, durante 24 h desde `doneAt`. */
export function isVisible(doneAt: string | null, now: number): boolean {
  if (doneAt === null) return true;
  return now - Date.parse(doneAt) < DONE_VISIBLE_MS;
}

/** Milisegundos que le quedan a una tarjeta hecha antes de ocultarse (0 si ya caducó). */
export function remainingMs(doneAt: string, now: number): number {
  return Math.max(0, Date.parse(doneAt) + DONE_VISIBLE_MS - now);
}

/** «21 h», «35 min» o «menos de 1 min». */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h`;
}

/**
 * Las tarjetas de un grupo no se colocan libremente: van apiladas, una debajo de otra. Su orden sale
 * de `y` (y luego `x`, fecha de creación e id), así los datos que ya existían conservan un orden
 * razonable sin migrar nada, y soltar una tarjeta en un punto del grupo la deja en ese lugar.
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

/** `y` de la posición `index` de la pila (las posiciones van de STACK_STEP en STACK_STEP). */
export function stackY(index: number): number {
  return clampCoord(index * STACK_STEP);
}

/** `y` para una tarjeta que se añade al final de la pila. */
export function stackEndY(members: readonly { y: number }[]): number {
  return members.length === 0 ? 0 : clampCoord(Math.max(...members.map((m) => m.y)) + STACK_STEP);
}
