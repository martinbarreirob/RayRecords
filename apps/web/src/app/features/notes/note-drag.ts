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

/** Estado de un arrastre en curso y reglas del mismo. Todo son funciones puras, sin DOM. */

export interface Drag {
  kind: 'card' | 'group' | 'resize';
  /** Tarjeta o grupo que se arrastra. */
  id: string;
  /** Puntero al empezar. */
  startX: number;
  startY: number;
  /** Posición y tamaño de partida, en coordenadas del lienzo. */
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  /** Posición y tamaño actuales mientras se arrastra. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Grupo sobre el que cae la tarjeta arrastrada. */
  over: string | null;
  moved: boolean;
  additive: boolean;
}

export const MIN_GROUP = 160;
/**
 * Por debajo de esta distancia (suma de |dx| y |dy|) es un clic, no un arrastre. Es generoso a
 * propósito: un clic con un pequeño temblor de la mano no debe mover la tarjeta.
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

/** Nuevo estado del arrastre con el puntero en `pointer`. Un movimiento mínimo no cuenta. */
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
  // La tarjeta cae en el grupo que haya bajo su centro.
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

/** Tarjetas que viajan con el arrastre: toda la selección si incluye la que se coge; si no, solo ella. */
export function draggedIds(drag: Drag, selected: ReadonlySet<string>): ReadonlySet<string> {
  return selected.has(drag.id) ? selected : new Set([drag.id]);
}

/**
 * Cómo se ven las tarjetas mientras se arrastran: cada una en su sitio del lienzo más el desplazamiento
 * del arrastre. Salen sueltas (sin grupo) porque se pintan por encima de todo el lienzo.
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
 * Movimientos al soltar: la tarjeta arrastrada y el resto de la selección se desplazan lo mismo.
 * `absolute` da la posición en el lienzo de cada tarjeta. Si cae sobre un grupo, pasan a ser suyas y
 * se colocan en su pila (ver `stackOrder`) según la altura a la que se suelten, entre las que ya
 * estaban; la `y` de las que cambian de puesto se reasigna y `x` queda en 0. Si no, quedan sueltas.
 * `heightOf` da el alto real de una tarjeta (por defecto, la estimación).
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

/** Rectángulo del grupo nuevo que envuelve a estas tarjetas: margen alrededor y hueco para el título. */
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
