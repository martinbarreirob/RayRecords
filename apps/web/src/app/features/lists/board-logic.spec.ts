import type { BoardColumn, Item } from '@rayrecords/shared';
import {
  applyMove,
  columnHue,
  columnKey,
  dropRequest,
  isOverdue,
  itemsInColumn,
  moveToRequest,
  neighbourId,
  shiftRequest,
  shortDate,
  stepRequest,
  summaryText,
  tagHue,
  todayLocal,
} from './board-logic';

const columns: BoardColumn[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'enCurso', label: 'En curso' },
  { key: 'hecho', label: 'Hecho' },
];

function item(id: string, column: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    listId: 'l1',
    title: id,
    tags: [],
    extra: {},
    column,
    order: 0,
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

// Pendiente: a, b, c · En curso: d, e · Hecho: (vacía)
const items = [
  item('a', 'pendiente'),
  item('b', 'pendiente'),
  item('c', 'pendiente'),
  item('d', 'enCurso'),
  item('e', 'enCurso'),
];

const ids = (list: Item[]) => list.map((i) => i.id).join('');

describe('board-logic: soltar una tarjeta', () => {
  it('al principio de otra columna, afterId es null', () => {
    expect(dropRequest(items, 'a', 'enCurso', 0)).toEqual({ afterId: null, column: 'enCurso' });
  });

  it('entre dos tarjetas de otra columna, va tras la de arriba', () => {
    expect(dropRequest(items, 'a', 'enCurso', 1)).toEqual({ afterId: 'd', column: 'enCurso' });
  });

  it('al final de otra columna, va tras la última', () => {
    expect(dropRequest(items, 'a', 'enCurso', 2)).toEqual({ afterId: 'e', column: 'enCurso' });
    expect(dropRequest(items, 'a', 'enCurso', 99)).toEqual({ afterId: 'e', column: 'enCurso' });
  });

  it('en una columna vacía, afterId es null', () => {
    expect(dropRequest(items, 'a', 'hecho', 0)).toEqual({ afterId: null, column: 'hecho' });
  });

  it('reordenando en la misma columna no cuenta la propia tarjeta', () => {
    // a pasa a la posición 2 de [b, c]: tras c.
    expect(dropRequest(items, 'a', 'pendiente', 2)).toEqual({ afterId: 'c', column: 'pendiente' });
    // c pasa a la posición 1 de [a, b]: tras a.
    expect(dropRequest(items, 'c', 'pendiente', 1)).toEqual({ afterId: 'a', column: 'pendiente' });
    // c pasa al principio.
    expect(dropRequest(items, 'c', 'pendiente', 0)).toEqual({ afterId: null, column: 'pendiente' });
  });
});

describe('board-logic: subir, bajar y cambiar de columna', () => {
  it('subir deja la tarjeta tras la que estaba dos puestos antes', () => {
    expect(stepRequest(items, 'c', -1)).toEqual({ afterId: 'a', column: 'pendiente' });
    expect(stepRequest(items, 'b', -1)).toEqual({ afterId: null, column: 'pendiente' });
  });

  it('bajar deja la tarjeta tras la siguiente', () => {
    expect(stepRequest(items, 'a', 1)).toEqual({ afterId: 'b', column: 'pendiente' });
  });

  it('en los extremos no hay movimiento', () => {
    expect(stepRequest(items, 'a', -1)).toBeNull();
    expect(stepRequest(items, 'c', 1)).toBeNull();
    expect(stepRequest(items, 'zz', 1)).toBeNull();
  });

  it('cambiar de columna deja la tarjeta al final de la vecina', () => {
    expect(shiftRequest(items, columns, 'a', 1)).toEqual({ afterId: 'e', column: 'enCurso' });
    expect(shiftRequest(items, columns, 'd', 1)).toEqual({ afterId: null, column: 'hecho' });
    expect(shiftRequest(items, columns, 'd', -1)).toEqual({ afterId: 'c', column: 'pendiente' });
  });

  it('no hay columna más allá de los extremos', () => {
    expect(shiftRequest(items, columns, 'a', -1)).toBeNull();
    expect(shiftRequest([item('h', 'hecho')], columns, 'h', 1)).toBeNull();
  });
});

describe('board-logic: mover a una columna (menú «Mover a…»)', () => {
  it('la tarjeta va al final de la columna elegida', () => {
    expect(moveToRequest(items, 'a', 'enCurso')).toEqual({ afterId: 'e', column: 'enCurso' });
  });

  it('a una columna vacía pasa a ser la primera', () => {
    expect(moveToRequest(items, 'a', 'hecho')).toEqual({ afterId: null, column: 'hecho' });
  });

  it('si ya está en esa columna o no existe no hay movimiento', () => {
    expect(moveToRequest(items, 'a', 'pendiente')).toBeNull();
    expect(moveToRequest(items, 'zz', 'hecho')).toBeNull();
  });
});

describe('board-logic: reflejo local del movimiento', () => {
  it('reordena dentro de la columna', () => {
    expect(ids(applyMove(items, 'a', 'pendiente', 'c'))).toBe('bcade');
    expect(ids(applyMove(items, 'c', 'pendiente', null))).toBe('cabde');
  });

  it('cambia de columna y de posición', () => {
    const moved = applyMove(items, 'a', 'enCurso', 'd');
    expect(itemsInColumn(moved, 'enCurso').map((i) => i.id)).toEqual(['d', 'a', 'e']);
    expect(itemsInColumn(moved, 'pendiente').map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('al principio de una columna con tarjetas, queda la primera de ella', () => {
    const moved = applyMove(items, 'a', 'enCurso', null);
    expect(itemsInColumn(moved, 'enCurso').map((i) => i.id)).toEqual(['a', 'd', 'e']);
  });

  it('en una columna vacía simplemente la añade', () => {
    const moved = applyMove(items, 'a', 'hecho', null);
    expect(itemsInColumn(moved, 'hecho').map((i) => i.id)).toEqual(['a']);
  });

  it('no toca la lista original y respeta una tarjeta desconocida', () => {
    applyMove(items, 'a', 'hecho', null);
    expect(ids(items)).toBe('abcde');
    expect(ids(applyMove(items, 'zz', 'hecho', null))).toBe('abcde');
  });
});

describe('board-logic: recorrido con J y K', () => {
  it('sin selección empieza por el principio o el final', () => {
    expect(neighbourId(items, columns, null, 1)).toBe('a');
    expect(neighbourId(items, columns, null, -1)).toBe('e');
  });

  it('avanza por la columna y salta a la siguiente', () => {
    expect(neighbourId(items, columns, 'a', 1)).toBe('b');
    expect(neighbourId(items, columns, 'c', 1)).toBe('d');
    expect(neighbourId(items, columns, 'd', -1)).toBe('c');
  });

  it('se queda donde está en los extremos y con tablero vacío', () => {
    expect(neighbourId(items, columns, 'a', -1)).toBeNull();
    expect(neighbourId(items, columns, 'e', 1)).toBeNull();
    expect(neighbourId([], columns, null, 1)).toBeNull();
  });
});

describe('board-logic: claves de columna', () => {
  it('pasa el nombre a camelCase sin acentos ni símbolos', () => {
    expect(columnKey('Por hacer', [])).toBe('porHacer');
    expect(columnKey('En revisión', [])).toBe('enRevision');
    expect(columnKey('  ¡Listo!  ', [])).toBe('listo');
  });

  it('evita repetir claves y las que no empiezan por letra', () => {
    expect(columnKey('Hecho', ['hecho'])).toBe('hecho2');
    expect(columnKey('Hecho', ['hecho', 'hecho2'])).toBe('hecho3');
    expect(columnKey('2026', [])).toBe('col2026');
    expect(columnKey('???', [])).toBe('col');
  });
});

describe('board-logic: fechas y resumen', () => {
  it('da fechas cortas sin depender de la zona horaria', () => {
    expect(shortDate('2026-11-12')).toBe('12 nov');
    expect(shortDate('2026-01-03T23:30:00.000Z')).toBe('3 ene');
    expect(shortDate('basura')).toBe('basura');
  });

  it('da el día de hoy en hora local', () => {
    expect(todayLocal(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('marca como vencida solo una fecha pasada', () => {
    expect(isOverdue('2026-11-03', '2026-11-04')).toBe(true);
    expect(isOverdue('2026-11-04', '2026-11-04')).toBe(false);
    expect(isOverdue(undefined, '2026-11-04')).toBe(false);
  });

  it('resume con los plurales bien', () => {
    const done = { doneAt: '2026-01-02T00:00:00.000Z' };
    expect(summaryText([], 'card')).toBe('0 tarjetas');
    expect(summaryText([item('a', 'x')], 'card')).toBe('1 tarjeta');
    expect(summaryText([item('a', 'x', done), item('b', 'x', done), item('c', 'x')], 'card')).toBe(
      '3 tarjetas · 2 hechas',
    );
    expect(summaryText([item('a', 'x', done)], 'item')).toBe('1 elemento · 1 hecho');
  });
});

describe('colores del tablero', () => {
  it('colorea las columnas habituales por su nombre', () => {
    expect(columnHue('Por hacer', 0)).toBe('blue');
    expect(columnHue('Pendiente', 2)).toBe('blue');
    expect(columnHue('En curso', 1)).toBe('amber');
    expect(columnHue('Hecho', 5)).toBe('green');
  });

  it('las columnas con otro nombre usan colores distintos de los del estado, por posición', () => {
    expect(columnHue('Bloqueado', 0)).toBe('violet');
    expect(columnHue('Bloqueado', 1)).toBe('teal');
    expect(columnHue('Bloqueado', 3)).toBe('violet');
  });

  it('las etiquetas de prioridad tienen color fijo', () => {
    expect(tagHue('alta')).toBe('rose');
    expect(tagHue('Media')).toBe('amber');
    expect(tagHue('baja')).toBe('green');
  });

  it('el resto de etiquetas tiene un color estable por texto', () => {
    expect(tagHue('cocina')).toBe(tagHue('Cocina '));
    expect(['blue', 'green', 'amber', 'rose', 'violet', 'teal']).toContain(tagHue('lo que sea'));
  });
});
