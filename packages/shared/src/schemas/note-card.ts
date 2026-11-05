import { z } from 'zod';
import { NOTE_COORD_MAX, NOTE_GROUP_HEIGHT, NOTE_GROUP_WIDTH } from '../note-constants';
import { IsoDateTime, ObjectIdString } from './common';

/** Notes are cards placed on a canvas; they can be grouped and marked as done. */

const Coord = z.number().int().min(0).max(NOTE_COORD_MAX);
const CardWidth = z.number().int().min(160).max(1_000);
const GroupSize = z.number().int().min(160).max(4_000);
const CardText = z.string().max(5_000);

export const NoteCardSchema = z.object({
  id: ObjectIdString,
  text: CardText,
  /** With a `groupId`, `x` and `y` are relative to the group corner; otherwise to the canvas. */
  x: Coord,
  y: Coord,
  w: CardWidth,
  /** Stacking order: the last card moved is on top. */
  z: z.number().int().min(0),
  groupId: ObjectIdString.nullable(),
  doneAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type NoteCard = z.infer<typeof NoteCardSchema>;

export const NoteGroupSchema = z.object({
  id: ObjectIdString,
  title: z.string().max(120),
  x: Coord,
  y: Coord,
  w: GroupSize,
  h: GroupSize,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type NoteGroup = z.infer<typeof NoteGroupSchema>;

/** What is drawn on the canvas: without cards done more than 24 h ago. */
export const NoteBoardSchema = z.object({
  cards: z.array(NoteCardSchema),
  groups: z.array(NoteGroupSchema),
});
export type NoteBoard = z.infer<typeof NoteBoardSchema>;

/** Without `x`/`y` the server picks the first free spot (quick capture, mobile). */
export const CreateNoteCardSchema = z.object({
  text: CardText.default(''),
  x: Coord.optional(),
  y: Coord.optional(),
  groupId: ObjectIdString.nullable().optional(),
});
export type CreateNoteCard = z.input<typeof CreateNoteCardSchema>;

export const UpdateNoteCardSchema = z
  .object({
    text: CardText,
    x: Coord,
    y: Coord,
    w: CardWidth,
    groupId: ObjectIdString.nullable(),
    /** `true` sets `doneAt` (once); `false` clears it. */
    done: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateNoteCard = z.infer<typeof UpdateNoteCardSchema>;

/** Move several cards at once (e.g. when grouping a selection). */
export const MoveNoteCardsSchema = z.object({
  moves: z
    .array(
      z.object({
        id: ObjectIdString,
        x: Coord,
        y: Coord,
        groupId: ObjectIdString.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type MoveNoteCards = z.infer<typeof MoveNoteCardsSchema>;

export const CreateNoteGroupSchema = z.object({
  title: z.string().max(120).default(''),
  x: Coord.optional(),
  y: Coord.optional(),
  w: GroupSize.default(NOTE_GROUP_WIDTH),
  h: GroupSize.default(NOTE_GROUP_HEIGHT),
});
export type CreateNoteGroup = z.input<typeof CreateNoteGroupSchema>;

export const UpdateNoteGroupSchema = z
  .object({
    title: z.string().max(120),
    x: Coord,
    y: Coord,
    w: GroupSize,
    h: GroupSize,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateNoteGroup = z.infer<typeof UpdateNoteGroupSchema>;
