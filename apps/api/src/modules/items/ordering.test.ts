import { describe, expect, it } from 'vitest';
import { ORDER_STEP, orderBetween, renumber } from './ordering';

describe('orderBetween', () => {
  it('lista vacía, al principio, al final y en medio', () => {
    expect(orderBetween(undefined, undefined)).toBe(ORDER_STEP);
    expect(orderBetween(undefined, 1000)).toBe(0);
    expect(orderBetween(3000, undefined)).toBe(4000);
    expect(orderBetween(1000, 2000)).toBe(1500);
  });

  it('pide renumerar cuando el hueco se agota', () => {
    let prev = 1000;
    const next = 2000;
    let guard = 0;
    while (orderBetween(prev, next) !== null && guard++ < 100) {
      prev = orderBetween(prev, next)!;
    }
    expect(orderBetween(prev, next)).toBeNull();
    expect(guard).toBeLessThan(100);
  });

  it('renumber da órdenes equiespaciados', () => {
    expect(renumber(3)).toEqual([1000, 2000, 3000]);
  });
});
