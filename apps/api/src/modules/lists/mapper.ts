import type { List } from '@rayrecords/shared';
import type { ListDoc } from '../../db/documents';

/** Mongo document to the DTO sent to the client. */
export function toList(doc: ListDoc): List {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    kind: doc.kind,
    ...(doc.icon !== undefined && { icon: doc.icon }),
    ...(doc.captureAlias !== undefined && { captureAlias: doc.captureAlias }),
    fieldDefs: doc.fieldDefs,
    ...(doc.board !== undefined && { board: doc.board }),
    order: doc.order,
    archived: doc.archived,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
