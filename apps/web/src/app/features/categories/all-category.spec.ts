import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryOps } from './categories-dialog';
import {
  ALL_CATEGORY_ID,
  DEFAULT_ALL_LOOK,
  allCategoryEntry,
  parseAllLook,
  withAllCategory,
} from './all-category';

describe('parseAllLook', () => {
  it('falls back to the default with nothing or garbage', () => {
    expect(parseAllLook(null)).toEqual(DEFAULT_ALL_LOOK);
    expect(parseAllLook('{nope')).toEqual(DEFAULT_ALL_LOOK);
  });

  it('keeps valid fields and repairs the invalid ones', () => {
    expect(
      parseAllLook(JSON.stringify({ icon: 'star', color: '#ABCDEF', iconColor: 'red' })),
    ).toEqual({
      icon: 'star',
      color: '#abcdef',
      iconColor: DEFAULT_ALL_LOOK.iconColor,
    });
    expect(parseAllLook(JSON.stringify({ icon: 'not-an-icon' })).icon).toBe('box');
  });
});

describe('all category entry', () => {
  it('is locked, named "Todas" and white with a box by default', () => {
    const entry = allCategoryEntry(DEFAULT_ALL_LOOK);
    expect(entry).toMatchObject({
      id: ALL_CATEGORY_ID,
      name: 'Todas',
      locked: true,
      icon: 'box',
      color: '#ffffff',
    });
  });

  it('routes its edits to the store and never to the API, and ignores a name', () => {
    const ops: CategoryOps = {
      create: vi.fn(),
      update: vi.fn(() => of(null)),
      remove: vi.fn(() => of(null)),
    };
    let look = DEFAULT_ALL_LOOK;
    const store = { look: () => look, save: (next: typeof look) => (look = next) };
    const wrapped = withAllCategory(ops, store);

    wrapped.update(ALL_CATEGORY_ID, { icon: 'star', name: 'Otra' }).subscribe();
    expect(look).toEqual({ ...DEFAULT_ALL_LOOK, icon: 'star' });
    wrapped.remove(ALL_CATEGORY_ID).subscribe();
    expect(ops.update).not.toHaveBeenCalled();
    expect(ops.remove).not.toHaveBeenCalled();

    wrapped.update('x', { name: 'Y' }).subscribe();
    expect(ops.update).toHaveBeenCalledWith('x', { name: 'Y' });
  });
});
