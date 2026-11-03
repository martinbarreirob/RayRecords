import type { List } from '@rayrecords/shared';
import type { ListDoc } from '../../db/documents';

/** Documento de Mongo → DTO que viaja al cliente. */
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
