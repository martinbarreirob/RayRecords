import type { NoteCard, NoteGroup } from '@rayrecords/shared';
import type { NoteCardDoc, NoteGroupDoc } from '../../db/documents';

export function toNoteCard(doc: NoteCardDoc): NoteCard {
  return {
    id: doc._id.toHexString(),
    text: doc.text,
    x: doc.x,
    y: doc.y,
    w: doc.w,
    z: doc.z,
    groupId: doc.groupId ? doc.groupId.toHexString() : null,
    doneAt: doc.doneAt ? doc.doneAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toNoteGroup(doc: NoteGroupDoc): NoteGroup {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    x: doc.x,
    y: doc.y,
    w: doc.w,
    h: doc.h,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
