import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, MIN_PAGE_SIZE, fitPageSize } from './page-size';

describe('fitPageSize', () => {
  it('counts the whole rows that fit', () => {
    expect(fitPageSize(860, 43)).toBe(20);
    expect(fitPageSize(859, 43)).toBe(19);
  });

  it('never goes under ten rows, even in a tiny window', () => {
    expect(fitPageSize(60, 43)).toBe(MIN_PAGE_SIZE);
    expect(MIN_PAGE_SIZE).toBe(10);
  });

  it('falls back to the default when nothing can be measured', () => {
    expect(fitPageSize(0, 43)).toBe(DEFAULT_PAGE_SIZE);
    expect(fitPageSize(500, 0)).toBe(DEFAULT_PAGE_SIZE);
    expect(fitPageSize(Number.NaN, 43)).toBe(DEFAULT_PAGE_SIZE);
  });
});
