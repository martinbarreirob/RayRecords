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
  it('sin nada colocado, usa la esquina con margen', () => {
    expect(nextFreePosition([])).toEqual({ x: 24, y: 24 });
  });

  it('salta a la derecha si el primer hueco está ocupado', () => {
    const pos = nextFreePosition([{ x: 24, y: 24, w: 280, h: 104 }]);
    expect(pos).toEqual({ x: 320, y: 24 });
  });

  it('baja de fila cuando la primera está llena', () => {
    const row = [24, 320, 616, 912].map((x) => ({ x, y: 24, w: 280, h: 104 }));
    expect(nextFreePosition(row)).toEqual({ x: 24, y: 144 });
  });

  it('esquiva un grupo grande', () => {
    const pos = nextFreePosition([{ x: 0, y: 0, w: 700, h: 400 }]);
    expect(pos.x).toBeGreaterThanOrEqual(700);
  });

  it('con un lienzo más ancho, la primera fila admite más tarjetas', () => {
    const row = [24, 320, 616, 912].map((x) => ({ x, y: 24, w: 280, h: 104 }));
    expect(nextFreePosition(row, undefined, 1_700)).toEqual({ x: 1_208, y: 24 });
  });

  it('con un lienzo estrecho, baja de fila antes', () => {
    const row = [{ x: 24, y: 24, w: 280, h: 104 }];
    expect(nextFreePosition(row, undefined, 590)).toEqual({ x: 24, y: 144 });
  });

  it('aunque la ventana sea más estrecha que una tarjeta, cabe una columna', () => {
    expect(nextFreePosition([], undefined, 100)).toEqual({ x: 24, y: 24 });
  });

  it('nunca se sale de los límites', () => {
    const full = [{ x: 0, y: 0, w: 2_000, h: NOTE_COORD_MAX + 500 }];
    const pos = nextFreePosition(full);
    expect(pos.y).toBeLessThanOrEqual(NOTE_COORD_MAX);
    expect(pos.x).toBeGreaterThanOrEqual(0);
  });
});

describe('coordenadas de grupo', () => {
  const group = { x: 100, y: 200 };

  it('ida y vuelta entre relativas y absolutas', () => {
    const abs = toAbsolute({ x: 10, y: 20 }, group);
    expect(abs).toEqual({ x: 110, y: 220 });
    expect(toRelative(abs, group)).toEqual({ x: 10, y: 20 });
  });

  it('al pasar a relativas nunca da negativos', () => {
    expect(toRelative({ x: 50, y: 150 }, group)).toEqual({ x: 0, y: 0 });
  });
});

describe('groupAtPoint', () => {
  const groups = [
    { id: 'a', x: 0, y: 0, w: 400, h: 400 },
    { id: 'b', x: 100, y: 100, w: 100, h: 100 },
  ];

  it('devuelve el grupo de encima cuando hay solape', () => {
    expect(groupAtPoint(groups, { x: 150, y: 150 })?.id).toBe('b');
  });

  it('puede excluir el grupo que se está arrastrando', () => {
    expect(groupAtPoint(groups, { x: 150, y: 150 }, 'b')?.id).toBe('a');
  });

  it('devuelve null fuera de cualquier grupo', () => {
    expect(groupAtPoint(groups, { x: 900, y: 900 })).toBeNull();
  });
});

describe('boundingBox', () => {
  it('rodea los rectángulos con margen', () => {
    const box = boundingBox(
      [
        { x: 10, y: 10, w: 100, h: 50 },
        { x: 200, y: 100, w: 100, h: 50 },
      ],
      8,
    );
    expect(box).toEqual({ x: 2, y: 2, w: 306, h: 156 });
  });

  it('sin rectángulos devuelve null', () => {
    expect(boundingBox([])).toBeNull();
  });
});

describe('tarjetas hechas: ocultar a las 24 h', () => {
  const doneAt = '2026-11-04T10:00:00.000Z';
  const t0 = Date.parse(doneAt);

  it('las pendientes siempre se ven', () => {
    expect(isVisible(null, t0 + 1000 * HOUR)).toBe(true);
  });

  it('una hecha se ve justo antes de las 24 h', () => {
    expect(isVisible(doneAt, t0 + DONE_VISIBLE_MS - 1)).toBe(true);
  });

  it('una hecha se oculta exactamente a las 24 h', () => {
    expect(isVisible(doneAt, t0 + DONE_VISIBLE_MS)).toBe(false);
  });

  it('calcula el tiempo restante sin bajar de cero', () => {
    expect(remainingMs(doneAt, t0 + 3 * HOUR)).toBe(21 * HOUR);
    expect(remainingMs(doneAt, t0 + 30 * HOUR)).toBe(0);
  });

  it('formatea la duración', () => {
    expect(formatDuration(21 * HOUR)).toBe('21 h');
    expect(formatDuration(35 * 60_000)).toBe('35 min');
    expect(formatDuration(10_000)).toBe('menos de 1 min');
  });
});

describe('readingOrder', () => {
  it('ordena por fila y, dentro de la fila, de izquierda a derecha', () => {
    const items = [
      { id: 'd', x: 500, y: 300 },
      { id: 'b', x: 500, y: 20 },
      { id: 'a', x: 10, y: 24 },
      { id: 'c', x: 10, y: 310 },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('dos notas casi alineadas cuentan como la misma fila', () => {
    const items = [
      { id: 'derecha', x: 400, y: 20 },
      { id: 'izquierda', x: 10, y: 60 },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['izquierda', 'derecha']);
  });

  it('no modifica la lista original', () => {
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

  it('sin elementos no devuelve nada', () => {
    expect(arrangeInGrid([], 1_120)).toEqual([]);
  });

  it('empieza arriba a la izquierda y sigue el orden de lectura', () => {
    const items = [card('c', 600, 400), card('a', 700, 30), card('b', 20, 36)];
    const placed = arrangeInGrid(items, 1_120);
    expect(placed.map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(placed[0]).toEqual({ id: 'b', x: 24, y: 24 });
    expect(placed[1]).toEqual({ id: 'a', x: 320, y: 24 });
  });

  it('baja de fila cuando se acaba el ancho (3 columnas en 1120 px)', () => {
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

  it('con un lienzo estrecho deja una sola columna', () => {
    const items = [card('a', 0, 0), card('b', 10, 10), card('c', 20, 20)];
    const placed = arrangeInGrid(items, 200);
    expect(placed.map((p) => p.x)).toEqual([24, 24, 24]);
    expect(placed.map((p) => p.y)).toEqual([24, 144, 264]);
  });

  it('cada fila mide lo que el elemento más alto (tarjetas con texto largo y grupos)', () => {
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
    // La tercera aún cabe en la primera fila; la cuarta baja bajo el grupo, que es el más alto (300).
    expect(byId.get('x')).toEqual({ id: 'x', x: 756, y: 24 });
    expect(byId.get('y')).toEqual({ id: 'y', x: 24, y: 24 + 300 + 16 });
  });

  it('no solapa nada con muchos elementos mezclados', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      i % 7 === 0
        ? { id: `g${i}`, x: (i * 53) % 900, y: (i * 37) % 700, w: 420, h: 300 }
        : { id: `c${i}`, x: (i * 91) % 900, y: (i * 61) % 700, w: 280, h: 104 + (i % 3) * 40 },
    );
    for (const width of [320, 700, 1_120, 1_900]) {
      const placed = arrangeInGrid(items, width);
      expect(placed).toHaveLength(items.length);
      noOverlap(items, placed);
      // Nunca se sale por la derecha (salvo que sea una sola columna más ancha que el lienzo).
      for (const p of placed) {
        const w = items.find((i) => i.id === p.id)!.w;
        expect(p.x + w).toBeLessThanOrEqual(Math.max(width, 24 * 2 + 420) - 24);
      }
    }
  });

  it('es estable: ordenar lo ya ordenado no cambia nada', () => {
    const items = [card('a', 0, 0), card('b', 5, 5), card('c', 9, 400), card('d', 3, 410, 150)];
    const once = arrangeInGrid(items, 1_120);
    const moved = items.map((item) => ({ ...item, ...once.find((p) => p.id === item.id)! }));
    expect(arrangeInGrid(moved, 1_120)).toEqual(once);
  });
});

describe('pila de un grupo', () => {
  const card = (id: string, x: number, y: number, createdAt = '2026-11-01T10:00:00.000Z') => ({
    id,
    x,
    y,
    createdAt,
  });

  it('ordena por y, luego x, luego fecha y por último id', () => {
    const ordered = stackOrder([
      card('d', 0, 50, '2026-11-02T10:00:00.000Z'),
      card('c', 0, 50, '2026-11-01T10:00:00.000Z'),
      card('b', 5, 20),
      card('a', 0, 20),
    ]);

    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('no modifica la lista original', () => {
    const list = [card('b', 0, 20), card('a', 0, 10)];

    stackOrder(list);

    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('la posición de la pila avanza de STACK_STEP en STACK_STEP y se acota', () => {
    expect(stackY(0)).toBe(0);
    expect(stackY(3)).toBe(3 * STACK_STEP);
    expect(stackY(1_000_000)).toBe(NOTE_COORD_MAX);
  });

  it('el final de la pila queda tras la última tarjeta', () => {
    expect(stackEndY([])).toBe(0);
    expect(stackEndY([{ y: 56 }, { y: 20 }])).toBe(56 + STACK_STEP);
  });
});
