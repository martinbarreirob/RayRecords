import type { Item } from '@rayrecords/shared';
import type { ItemDoc } from '../../db/documents';

export function toItem(doc: ItemDoc): Item {
  return {
    id: doc._id.toHexString(),
    listId: doc.listId.toHexString(),
    title: doc.title,
    ...(doc.text !== undefined && { text: doc.text }),
    tags: doc.tags,
    ...(doc.dueDate !== undefined && { dueDate: doc.dueDate }),
    ...(doc.time !== undefined && { time: doc.time }),
    ...(doc.url !== undefined && { url: doc.url }),
    extra: doc.extra,
    ...(doc.column !== undefined && { column: doc.column }),
    order: doc.order,
    ...(doc.doneAt !== undefined && { doneAt: doc.doneAt.toISOString() }),
    source: doc.source,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
