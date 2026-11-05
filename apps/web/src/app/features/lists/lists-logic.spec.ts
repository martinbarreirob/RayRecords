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

describe('lists-logic: capture alias', () => {
  it('cleanAlias lowercases and removes spaces', () => {
    expect(cleanAlias('  Peli ')).toBe('peli');
    expect(cleanAlias('mi lista')).toBe('milista');
  });

  it('an empty or valid alias has no error', () => {
    expect(aliasError('')).toBeNull();
    expect(aliasError('peli')).toBeNull();
    expect(aliasError('compra2')).toBeNull();
    expect(aliasError('a'.repeat(20))).toBeNull();
  });

  it('explains why it is not valid', () => {
    expect(aliasError('1peli')).toBe('Debe empezar por una letra');
    expect(aliasError('a')).toBe('Necesita al menos 2 caracteres');
    expect(aliasError('a'.repeat(21))).toBe('Máximo 20 caracteres');
    expect(aliasError('película')).toBe('Solo letras sin tilde y números, sin espacios');
    expect(aliasError('a-b')).toBe('Solo letras sin tilde y números, sin espacios');
  });
});

const ls = (...orders: number[]) => orders.map((order, i) => ({ id: `l${i}`, order }));
const ids = (lists: { id: string }[]) => lists.map((l) => l.id);

describe('lists-logic: order', () => {
  it('orderBetween: empty, ends and midpoint', () => {
    expect(orderBetween(undefined, undefined)).toBe(ORDER_STEP);
    expect(orderBetween(undefined, 1000)).toBe(0);
    expect(orderBetween(3000, undefined)).toBe(4000);
    expect(orderBetween(1000, 2000)).toBe(1500);
  });

  it('orderBetween asks to renumber when the gap runs out or there is a tie', () => {
    expect(orderBetween(1000, 1000)).toBeNull();
    expect(orderBetween(2000, 1000)).toBeNull();
    let prev = 1000;
    let guard = 0;
    while (orderBetween(prev, 2000) !== null && guard++ < 100) prev = orderBetween(prev, 2000)!;
    expect(guard).toBeLessThan(100);
    expect(orderBetween(prev, 2000)).toBeNull();
  });

  it('renumber gives evenly spaced orders', () => {
    expect(renumber(3)).toEqual([1000, 2000, 3000]);
    expect(renumber(0)).toEqual([]);
  });

  it('planReorder: in the middle takes the midpoint and changes only one list', () => {
    const plan = planReorder(ls(1000, 2000, 3000, 4000), 'l0', 2)!;
    expect(ids(plan.lists)).toEqual(['l1', 'l2', 'l0', 'l3']);
    expect(plan.patches).toEqual([{ id: 'l0', order: 3500 }]);
    expect(plan.lists[2]!.order).toBe(3500);
  });

  it('planReorder: at the start and end uses a step from the end', () => {
    const first = planReorder(ls(1000, 2000, 3000), 'l2', 0)!;
    expect(ids(first.lists)).toEqual(['l2', 'l0', 'l1']);
    expect(first.patches).toEqual([{ id: 'l2', order: 0 }]);

    const last = planReorder(ls(1000, 2000, 3000), 'l0', 2)!;
    expect(ids(last.lists)).toEqual(['l1', 'l2', 'l0']);
    expect(last.patches).toEqual([{ id: 'l0', order: 4000 }]);
  });

  it('planReorder: moves up or down one place between neighbours', () => {
    const down = planReorder(ls(1000, 2000, 3000), 'l0', 1)!;
    expect(ids(down.lists)).toEqual(['l1', 'l0', 'l2']);
    expect(down.patches).toEqual([{ id: 'l0', order: 2500 }]);

    const up = planReorder(ls(1000, 2000, 3000), 'l2', 1)!;
    expect(ids(up.lists)).toEqual(['l0', 'l2', 'l1']);
    expect(up.patches).toEqual([{ id: 'l2', order: 1500 }]);
  });

  it('planReorder: clamps the position and does nothing if it does not change', () => {
    expect(ids(planReorder(ls(1000, 2000, 3000), 'l0', 99)!.lists)).toEqual(['l1', 'l2', 'l0']);
    expect(ids(planReorder(ls(1000, 2000, 3000), 'l2', -5)!.lists)).toEqual(['l2', 'l0', 'l1']);
    expect(planReorder(ls(1000, 2000, 3000), 'l1', 1)).toBeNull();
    expect(planReorder(ls(1000, 2000, 3000), 'nope', 0)).toBeNull();
    expect(planReorder([], 'l0', 0)).toBeNull();
  });

  it('planReorder: renumbers when there is no gap and sends only what changes', () => {
    // l0 moves to position 1, between l1 and l2, which are already adjacent (same order): renumber.
    const plan = planReorder(ls(500, 1000, 1000, 5000), 'l0', 1)!;
    expect(ids(plan.lists)).toEqual(['l1', 'l0', 'l2', 'l3']);
    expect(plan.lists.map((l) => l.order)).toEqual([1000, 2000, 3000, 4000]);
    // l1 was already 1000: it is not resent.
    expect(plan.patches).toEqual([
      { id: 'l0', order: 2000 },
      { id: 'l2', order: 3000 },
      { id: 'l3', order: 4000 },
    ]);
  });

  it('planReorder: always placing right after the same neighbour exhausts the gap, renumbers and keeps the order', () => {
    let lists = ls(1000, 2000, 3000);
    let renumbers = 0;
    for (let i = 0; i < 60; i++) {
      // Each time one of the last two goes to position 1 (between l0 and the other): the gap halves.
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

  it('stepIndex: one place up or down, or null at the end', () => {
    const lists = ls(1000, 2000, 3000);
    expect(stepIndex(lists, 'l1', -1)).toBe(0);
    expect(stepIndex(lists, 'l1', 1)).toBe(2);
    expect(stepIndex(lists, 'l0', -1)).toBeNull();
    expect(stepIndex(lists, 'l2', 1)).toBeNull();
    expect(stepIndex(lists, 'nope', 1)).toBeNull();
  });

  it('sortByOrder sorts without mutating and is stable', () => {
    const input = [
      { id: 'a', order: 2 },
      { id: 'b', order: 1 },
      { id: 'c', order: 1 },
    ];
    expect(ids(sortByOrder(input))).toEqual(['b', 'c', 'a']);
    expect(ids(input)).toEqual(['a', 'b', 'c']);
  });

  it('movedMessage counts the position from 1', () => {
    expect(movedMessage('Películas', 1, 6)).toBe('Películas movida a la posición 2 de 6');
  });
});
