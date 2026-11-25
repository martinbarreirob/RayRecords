import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import type { ItemDoc } from '../../db/documents';
import { diffItem } from './history';

const base = (): ItemDoc => ({
  _id: new ObjectId(),
  listId: new ObjectId(),
  title: 'Reserva',
  tags: [],
  extra: {},
  column: 'porHacer',
  order: 1,
  source: 'manual',
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe('diffItem', () => {
  it('is empty when nothing changed', () => {
    const item = base();
    expect(diffItem(item, { ...item, order: 5, updatedAt: new Date() })).toEqual({});
  });

  it('lists the fields that changed, the column, done and the extra keys', () => {
    const before = base();
    const after: ItemDoc = {
      ...before,
      title: 'Reserva online',
      column: 'hecho',
      doneAt: new Date(),
      extra: { priority: 'high' },
    };
    expect(diffItem(before, after)).toEqual({
      title: { from: 'Reserva', to: 'Reserva online' },
      column: { from: 'porHacer', to: 'hecho' },
      done: { from: null, to: true },
      'extra.priority': { from: null, to: 'high' },
    });
  });
});
