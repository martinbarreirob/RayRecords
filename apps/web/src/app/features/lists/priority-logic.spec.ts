import { PRIORITIES, priorityLevel, priorityOf } from './priority-logic';

describe('priority-logic', () => {
  it('fills one to four bars from low to urgent', () => {
    expect(PRIORITIES.map(priorityLevel)).toEqual([1, 2, 3, 4]);
  });

  it('reads the priority of a card and ignores unknown values', () => {
    expect(priorityOf({ extra: { priority: 'high' } })).toBe('high');
    expect(priorityOf({ extra: { priority: 'x' } })).toBeNull();
    expect(priorityOf({ extra: {} })).toBeNull();
  });

  it('reads the old prioridad select until a priority is set', () => {
    expect(priorityOf({ extra: { prioridad: 'media' } })).toBe('medium');
    expect(priorityOf({ extra: { prioridad: 'media', priority: 'low' } })).toBe('low');
  });
});
