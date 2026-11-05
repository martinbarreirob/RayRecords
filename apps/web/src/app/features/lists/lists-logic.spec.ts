import {
  ORDER_STEP,
  aliasError,
  cleanAlias,
  movedMessage,
  orderBetween,
  planReorder,
  renumber,
  sortByOrder,
  stepIndex,
} from './lists-logic';

describe('lists-logic: alias de captura', () => {
  it('cleanAlias pasa a minúsculas y quita espacios', () => {
    expect(cleanAlias('  Peli ')).toBe('peli');
    expect(cleanAlias('mi lista')).toBe('milista');
  });

  it('un alias vacío o correcto no tiene error', () => {
    expect(aliasError('')).toBeNull();
    expect(aliasError('peli')).toBeNull();
    expect(aliasError('compra2')).toBeNull();
    expect(aliasError('a'.repeat(20))).toBeNull();
  });

  it('explica por qué no vale', () => {
    expect(aliasError('1peli')).toBe('Debe empezar por una letra');
    expect(aliasError('a')).toBe('Necesita al menos 2 caracteres');
    expect(aliasError('a'.repeat(21))).toBe('Máximo 20 caracteres');
    expect(aliasError('película')).toBe('Solo letras sin tilde y números, sin espacios');
    expect(aliasError('a-b')).toBe('Solo letras sin tilde y números, sin espacios');
  });
});

const ls = (...orders: number[]) => orders.map((order, i) => ({ id: `l${i}`, order }));
const ids = (lists: { id: string }[]) => lists.map((l) => l.id);

describe('lists-logic: orden', () => {
  it('orderBetween: vacío, extremos y punto medio', () => {
    expect(orderBetween(undefined, undefined)).toBe(ORDER_STEP);
    expect(orderBetween(undefined, 1000)).toBe(0);
    expect(orderBetween(3000, undefined)).toBe(4000);
    expect(orderBetween(1000, 2000)).toBe(1500);
  });

  it('orderBetween pide renumerar cuando el hueco se agota o hay empate', () => {
    expect(orderBetween(1000, 1000)).toBeNull();
    expect(orderBetween(2000, 1000)).toBeNull();
    let prev = 1000;
    let guard = 0;
    while (orderBetween(prev, 2000) !== null && guard++ < 100) prev = orderBetween(prev, 2000)!;
    expect(guard).toBeLessThan(100);
    expect(orderBetween(prev, 2000)).toBeNull();
  });

  it('renumber da órdenes equiespaciados', () => {
    expect(renumber(3)).toEqual([1000, 2000, 3000]);
    expect(renumber(0)).toEqual([]);
  });

  it('planReorder: en medio toma el punto medio y solo cambia una lista', () => {
    const plan = planReorder(ls(1000, 2000, 3000, 4000), 'l0', 2)!;
    expect(ids(plan.lists)).toEqual(['l1', 'l2', 'l0', 'l3']);
    expect(plan.patches).toEqual([{ id: 'l0', order: 3500 }]);
    expect(plan.lists[2]!.order).toBe(3500);
  });

  it('planReorder: al principio y al final usa un paso desde el extremo', () => {
    const first = planReorder(ls(1000, 2000, 3000), 'l2', 0)!;
    expect(ids(first.lists)).toEqual(['l2', 'l0', 'l1']);
    expect(first.patches).toEqual([{ id: 'l2', order: 0 }]);

    const last = planReorder(ls(1000, 2000, 3000), 'l0', 2)!;
    expect(ids(last.lists)).toEqual(['l1', 'l2', 'l0']);
    expect(last.patches).toEqual([{ id: 'l0', order: 4000 }]);
  });

  it('planReorder: sube o baja un puesto entre vecinas', () => {
    const down = planReorder(ls(1000, 2000, 3000), 'l0', 1)!;
    expect(ids(down.lists)).toEqual(['l1', 'l0', 'l2']);
    expect(down.patches).toEqual([{ id: 'l0', order: 2500 }]);

    const up = planReorder(ls(1000, 2000, 3000), 'l2', 1)!;
    expect(ids(up.lists)).toEqual(['l0', 'l2', 'l1']);
    expect(up.patches).toEqual([{ id: 'l2', order: 1500 }]);
  });

  it('planReorder: acota la posición y no hace nada si no cambia', () => {
    expect(ids(planReorder(ls(1000, 2000, 3000), 'l0', 99)!.lists)).toEqual(['l1', 'l2', 'l0']);
    expect(ids(planReorder(ls(1000, 2000, 3000), 'l2', -5)!.lists)).toEqual(['l2', 'l0', 'l1']);
    expect(planReorder(ls(1000, 2000, 3000), 'l1', 1)).toBeNull();
    expect(planReorder(ls(1000, 2000, 3000), 'nope', 0)).toBeNull();
    expect(planReorder([], 'l0', 0)).toBeNull();
  });

  it('planReorder: renumera cuando no queda hueco y solo envía lo que cambia', () => {
    // l0 pasa a la posición 1, entre l1 y l2, que ya están pegadas (mismo orden): hay que renumerar.
    const plan = planReorder(ls(500, 1000, 1000, 5000), 'l0', 1)!;
    expect(ids(plan.lists)).toEqual(['l1', 'l0', 'l2', 'l3']);
    expect(plan.lists.map((l) => l.order)).toEqual([1000, 2000, 3000, 4000]);
    // l1 ya valía 1000: no se reenvía.
    expect(plan.patches).toEqual([
      { id: 'l0', order: 2000 },
      { id: 'l2', order: 3000 },
      { id: 'l3', order: 4000 },
    ]);
  });

  it('planReorder: colocar siempre justo tras la misma vecina agota el hueco, renumera y no rompe el orden', () => {
    let lists = ls(1000, 2000, 3000);
    let renumbers = 0;
    for (let i = 0; i < 60; i++) {
      // Cada vez una de las dos últimas pasa a la posición 1 (entre l0 y la otra): el hueco se divide por dos.
      const plan = planReorder(lists, i % 2 === 0 ? 'l2' : 'l1', 1)!;
      if (plan.patches.length > 1) renumbers++;
      lists = plan.lists;
      expect(lists[0]!.id).toBe('l0');
      const orders = lists.map((l) => l.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(3);
    }
    expect(renumbers).toBeGreaterThan(0);
  });

  it('stepIndex: un puesto arriba o abajo, o null en el extremo', () => {
    const lists = ls(1000, 2000, 3000);
    expect(stepIndex(lists, 'l1', -1)).toBe(0);
    expect(stepIndex(lists, 'l1', 1)).toBe(2);
    expect(stepIndex(lists, 'l0', -1)).toBeNull();
    expect(stepIndex(lists, 'l2', 1)).toBeNull();
    expect(stepIndex(lists, 'nope', 1)).toBeNull();
  });

  it('sortByOrder ordena sin mutar y es estable', () => {
    const input = [
      { id: 'a', order: 2 },
      { id: 'b', order: 1 },
      { id: 'c', order: 1 },
    ];
    expect(ids(sortByOrder(input))).toEqual(['b', 'c', 'a']);
    expect(ids(input)).toEqual(['a', 'b', 'c']);
  });

  it('movedMessage cuenta la posición desde 1', () => {
    expect(movedMessage('Películas', 1, 6)).toBe('Películas movida a la posición 2 de 6');
  });
});
