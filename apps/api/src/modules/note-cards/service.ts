import {
  CARD_ESTIMATED_HEIGHT,
  DONE_VISIBLE_MS,
  NOTE_CARD_WIDTH,
  NOTE_GROUP_HEIGHT,
  NOTE_GROUP_WIDTH,
  clampCoord,
  nextFreePosition,
  toAbsolute,
  type CreateNoteCard,
  type CreateNoteGroup,
  type MoveNoteCards,
  type Rect,
  type UpdateNoteCard,
  type UpdateNoteGroup,
} from '@rayrecords/shared';
import { ObjectId, type Filter } from 'mongodb';
import type { Collections } from '../../db/client';
import type { NoteCardDoc, NoteGroupDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';

/** Default position inside a group (below its title). */
const IN_GROUP_DEFAULT = { x: 16, y: 56 };

/**
 * Cards that are shown: pending ones and those done less than 24 h ago. Filtered on read, with no
 * background job deleting or hiding anything; a done card stays in the database.
 */
function visibleFilter(now: Date): Filter<NoteCardDoc> {
  return {
    $or: [{ doneAt: null }, { doneAt: { $gt: new Date(now.getTime() - DONE_VISIBLE_MS) } }],
  };
}

export async function listBoard(c: Collections, now = new Date()) {
  const [cards, groups] = await Promise.all([
    c.noteCards.find(visibleFilter(now)).sort({ z: 1, _id: 1 }).toArray(),
    c.noteGroups.find().sort({ _id: 1 }).toArray(),
  ]);
  return { cards, groups };
}

/** Done more than 24 h ago: no longer on the canvas, but still listable and recoverable. */
export async function listDone(c: Collections, now = new Date()): Promise<NoteCardDoc[]> {
  return c.noteCards
    .find({ doneAt: { $lte: new Date(now.getTime() - DONE_VISIBLE_MS) } })
    .sort({ doneAt: -1 })
    .limit(200)
    .toArray();
}

async function nextZ(c: Collections): Promise<number> {
  const top = await c.noteCards.findOne({}, { sort: { z: -1 }, projection: { z: 1 } });
  return (top?.z ?? -1) + 1;
}

/** Occupied canvas rectangles (visible loose cards and groups), used to find a free spot. */
async function occupiedRects(c: Collections, now: Date): Promise<Rect[]> {
  const { cards, groups } = await listBoard(c, now);
  return [
    ...cards
      .filter((card) => card.groupId === null)
      .map((card) => ({ x: card.x, y: card.y, w: card.w, h: CARD_ESTIMATED_HEIGHT })),
    ...groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
  ];
}

async function requireGroup(c: Collections, id: string): Promise<NoteGroupDoc> {
  const group = await c.noteGroups.findOne({ _id: new ObjectId(id) });
  if (!group) throw new ApiError(404, 'not_found', 'El grupo no existe');
  return group;
}

export async function createCard(
  c: Collections,
  input: CreateNoteCard,
  now = new Date(),
): Promise<NoteCardDoc> {
  const groupId = input.groupId ? (await requireGroup(c, input.groupId))._id : null;

  let position: { x: number; y: number };
  if (input.x !== undefined && input.y !== undefined) position = { x: input.x, y: input.y };
  else if (groupId) position = IN_GROUP_DEFAULT;
  else position = nextFreePosition(await occupiedRects(c, now));

  const doc: NoteCardDoc = {
    _id: new ObjectId(),
    text: input.text ?? '',
    ...position,
    w: NOTE_CARD_WIDTH,
    z: await nextZ(c),
    groupId,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await c.noteCards.insertOne(doc);
  return doc;
}

export async function updateCard(
  c: Collections,
  id: string,
  patch: UpdateNoteCard,
  now = new Date(),
): Promise<NoteCardDoc> {
  const current = await c.noteCards.findOne({ _id: new ObjectId(id) });
  if (!current) throw new ApiError(404, 'not_found', 'La nota no existe');

  const $set: Partial<NoteCardDoc> = { updatedAt: now };
  if (patch.text !== undefined) $set.text = patch.text;
  if (patch.w !== undefined) $set.w = patch.w;
  if (patch.x !== undefined) $set.x = patch.x;
  if (patch.y !== undefined) $set.y = patch.y;
  // Moving a card brings it to the front.
  if (patch.x !== undefined || patch.y !== undefined) $set.z = await nextZ(c);
  if (patch.groupId !== undefined) {
    $set.groupId = patch.groupId === null ? null : (await requireGroup(c, patch.groupId))._id;
  }
  // Marking it done again keeps the date: the 24 h window counts from the first time.
  if (patch.done === true) $set.doneAt = current.doneAt ?? now;
  if (patch.done === false) $set.doneAt = null;

  const updated = await c.noteCards.findOneAndUpdate(
    { _id: current._id },
    { $set },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ApiError(404, 'not_found', 'La nota no existe');
  return updated;
}

/** Moves several cards at once (all or none if one does not exist). */
export async function moveCards(
  c: Collections,
  { moves }: MoveNoteCards,
  now = new Date(),
): Promise<NoteCardDoc[]> {
  const ids = moves.map((m) => new ObjectId(m.id));
  const found = await c.noteCards.countDocuments({ _id: { $in: ids } });
  if (found !== new Set(moves.map((m) => m.id)).size) {
    throw new ApiError(404, 'not_found', 'Alguna de las notas no existe');
  }

  const groupIds = new Map<string, ObjectId>();
  for (const id of new Set(moves.flatMap((m) => (m.groupId ? [m.groupId] : [])))) {
    groupIds.set(id, (await requireGroup(c, id))._id);
  }

  const baseZ = await nextZ(c);
  await c.noteCards.bulkWrite(
    moves.map((move, index) => ({
      updateOne: {
        filter: { _id: new ObjectId(move.id) },
        update: {
          $set: {
            x: move.x,
            y: move.y,
            z: baseZ + index,
            updatedAt: now,
            ...(move.groupId !== undefined && {
              groupId: move.groupId === null ? null : groupIds.get(move.groupId)!,
            }),
          },
        },
      },
    })),
  );
  return c.noteCards.find({ _id: { $in: ids } }).toArray();
}

export async function deleteCard(c: Collections, id: string): Promise<void> {
  const result = await c.noteCards.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) throw new ApiError(404, 'not_found', 'La nota no existe');
}

export async function createGroup(
  c: Collections,
  input: CreateNoteGroup,
  now = new Date(),
): Promise<NoteGroupDoc> {
  const w = input.w ?? NOTE_GROUP_WIDTH;
  const h = input.h ?? NOTE_GROUP_HEIGHT;
  const position =
    input.x !== undefined && input.y !== undefined
      ? { x: input.x, y: input.y }
      : nextFreePosition(await occupiedRects(c, now), { w, h });

  const doc: NoteGroupDoc = {
    _id: new ObjectId(),
    title: input.title ?? '',
    ...position,
    w,
    h,
    createdAt: now,
    updatedAt: now,
  };
  await c.noteGroups.insertOne(doc);
  return doc;
}

export async function updateGroup(
  c: Collections,
  id: string,
  patch: UpdateNoteGroup,
  now = new Date(),
): Promise<NoteGroupDoc> {
  const updated = await c.noteGroups.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: now } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new ApiError(404, 'not_found', 'El grupo no existe');
  return updated;
}

/**
 * Dissolves a group: its cards are kept and stay at the same place on the canvas (coordinates go
 * from relative to absolute). Returns the released cards.
 */
export async function dissolveGroup(
  c: Collections,
  id: string,
  now = new Date(),
): Promise<NoteCardDoc[]> {
  const group = await requireGroup(c, id);
  const children = await c.noteCards.find({ groupId: group._id }).toArray();

  if (children.length > 0) {
    await c.noteCards.bulkWrite(
      children.map((card) => {
        const abs = toAbsolute(card, group);
        return {
          updateOne: {
            filter: { _id: card._id },
            update: {
              $set: { groupId: null, x: clampCoord(abs.x), y: clampCoord(abs.y), updatedAt: now },
            },
          },
        };
      }),
    );
  }
  await c.noteGroups.deleteOne({ _id: group._id });
  return c.noteCards.find({ _id: { $in: children.map((card) => card._id) } }).toArray();
}
