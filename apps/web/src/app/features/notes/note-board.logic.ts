import {
  CARD_ESTIMATED_HEIGHT,
  type Placeable,
  isVisible,
  nextFreePosition,
  type NoteCard,
  type Rect,
} from '@rayrecords/shared';

/** Lógica pura de la pantalla de notas (sin DOM ni Angular), para poder probarla aparte. */

/** Primera línea como título de la tarjeta y el resto como cuerpo secundario. */
export function splitNoteText(text: string): { title: string; body: string } {
  const trimmed = text.replace(/^\s*\n/, '');
  const newline = trimmed.indexOf('\n');
  if (newline === -1) return { title: trimmed.trim(), body: '' };
  return { title: trimmed.slice(0, newline).trim(), body: trimmed.slice(newline + 1).trim() };
}

/** ¿Se solapan dos rectángulos? Si solo se tocan por el borde no cuenta. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Rectángulo entre dos puntos, vengan en el orden que vengan (para el marco de selección). */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Ids de los rectángulos que toca el marco, sumados a los que ya estaban seleccionados. */
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
 * Tarjetas «terminadas»: las que ya no se ven en el lienzo (hechas hace más de 24 h). Une las que
 * pidió el servidor con las que acaban de caducar en memoria, sin repetir, las más recientes primero.
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

/** Paso del movimiento con el teclado, en px. */
export const KEY_STEP = 16;

/**
 * Desplazamiento de una pulsación de flecha que mueve las tarjetas seleccionadas: solo Mayús+flecha.
 * Alt+flecha es la navegación global entre secciones y Ctrl/Meta+Mayús+flecha selecciona texto, así
 * que con cualquiera de ellos no se mueve nada (y la pantalla no debe cancelar la pulsación).
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

/** Altura de una tarjeta suelta a efectos de buscar huecos y de medir el lienzo. */
const CARD_HEIGHT = CARD_ESTIMATED_HEIGHT;

/** Rectángulos ocupados del lienzo (tarjetas sueltas y grupos), en coordenadas del lienzo. */
export function occupiedRects(
  loose: readonly Pick<NoteCard, 'x' | 'y' | 'w'>[],
  groups: readonly Rect[],
): Rect[] {
  return [
    ...loose.map((card) => ({ x: card.x, y: card.y, w: card.w, h: CARD_HEIGHT })),
    ...groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
  ];
}

/** Primer hueco libre para una tarjeta nueva en un lienzo del ancho real de la ventana. */
export function freeSlot(
  loose: readonly Pick<NoteCard, 'x' | 'y' | 'w'>[],
  groups: readonly Rect[],
  canvasWidth: number,
): { x: number; y: number } {
  return nextFreePosition(occupiedRects(loose, groups), undefined, canvasWidth);
}

/** Borde derecho de lo más alejado que hay en el lienzo (0 si está vacío). */
export function rightEdge(
  loose: readonly Pick<NoteCard, 'x' | 'w'>[],
  groups: readonly Pick<Rect, 'x' | 'w'>[],
): number {
  return Math.max(0, ...loose.map((c) => c.x + c.w), ...groups.map((g) => g.x + g.w));
}

/**
 * Elementos que entran en «Ordenar»: tarjetas sueltas (con su alto real si se conoce; si no, la
 * estimación) y grupos. Las tarjetas de dentro de un grupo viajan con él y no cuentan.
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
