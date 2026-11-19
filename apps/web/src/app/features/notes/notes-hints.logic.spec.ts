import { paginateHints } from './notes-hints.logic';

describe('paginateHints', () => {
  it('keeps everything on one page when it fits', () => {
    expect(paginateHints([50, 60, 70], 10, 200)).toEqual([{ from: 0, to: 3 }]);
  });

  it('counts the gaps between hints', () => {
    // 50 + 10 + 60 + 10 + 70 = 200 fits exactly; one pixel less does not.
    expect(paginateHints([50, 60, 70], 10, 199)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 3 },
    ]);
  });

  it('splits into as many pages as needed, never cutting a hint', () => {
    expect(paginateHints([80, 80, 80, 80, 80], 10, 180)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
      { from: 4, to: 5 },
    ]);
  });

  it('gives a page of its own to a hint wider than the space', () => {
    expect(paginateHints([300, 40, 40], 10, 100)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 3 },
    ]);
  });

  it('shows everything while nothing has been measured', () => {
    expect(paginateHints([0, 0, 0], 0, 0)).toEqual([{ from: 0, to: 3 }]);
  });

  it('returns no pages without hints', () => {
    expect(paginateHints([], 10, 100)).toEqual([]);
  });
});
