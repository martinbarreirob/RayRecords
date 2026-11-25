import type { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import type { ItemDoc } from '../../db/documents';

/** What a history entry records: the item was created, edited, or changed column. */
export type HistoryType = 'created' | 'updated' | 'moved';

/** The fields whose changes are recorded, besides `extra.<key>` and `doneAt`. */
const TRACKED = ['title', 'text', 'tags', 'dueDate', 'time', 'url', 'column'] as const;

type Changes = Record<string, { from: unknown; to: unknown }>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields that differ between two versions of an item. */
export function diffItem(before: ItemDoc, after: ItemDoc): Changes {
  const changes: Changes = {};
  for (const key of TRACKED) {
    if (!same(before[key], after[key]))
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  const done = (item: ItemDoc) => (item.doneAt ? true : null);
  if (!same(done(before), done(after))) changes.done = { from: done(before), to: done(after) };
  for (const key of new Set([...Object.keys(before.extra), ...Object.keys(after.extra)])) {
    if (!same(before.extra[key], after.extra[key])) {
      changes[`extra.${key}`] = { from: before.extra[key] ?? null, to: after.extra[key] ?? null };
    }
  }
  return changes;
}

/**
 * Appends to the item's history. It is for internal use (nothing in the API or the web reads it
 * yet): who changed what and when, to be able to show or audit it later.
 */
export async function recordHistory(
  c: Collections,
  item: { _id: ObjectId; listId: ObjectId },
  type: HistoryType,
  changes: Changes = {},
  at = new Date(),
): Promise<void> {
  if (type !== 'created' && Object.keys(changes).length === 0) return;
  await c.itemHistory.insertOne({ itemId: item._id, listId: item.listId, at, type, changes });
}
