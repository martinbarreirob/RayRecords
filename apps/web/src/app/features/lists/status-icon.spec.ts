import { columnIcon, defaultIcon } from './status-icon';

describe('status icons', () => {
  it('shows to do first, done last and in progress in between', () => {
    expect([0, 1, 2].map((i) => defaultIcon(i, 3))).toEqual(['todo', 'progress', 'done']);
    expect([0, 1, 2, 3].map((i) => defaultIcon(i, 4))).toEqual([
      'todo',
      'progress',
      'progress',
      'done',
    ]);
  });

  it('a single column is to do', () => {
    expect(defaultIcon(0, 1)).toBe('todo');
  });

  it('the icon chosen for a column wins over its position', () => {
    expect(columnIcon({ icon: 'review' }, 0, 3)).toBe('review');
    expect(columnIcon({}, 2, 3)).toBe('done');
    expect(columnIcon(undefined, 0, 3)).toBe('todo');
  });
});
