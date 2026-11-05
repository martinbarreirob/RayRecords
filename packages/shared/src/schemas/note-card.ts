import { z } from 'zod';
import { NOTE_COORD_MAX, NOTE_GROUP_HEIGHT, NOTE_GROUP_WIDTH } from '../note-constants';
import { IsoDateTime, ObjectIdString } from './common';

/** Las notas son tarjetas colocadas en un lienzo; se pueden agrupar y marcar como hechas. */

const Coord = z.number().int().min(0).max(NOTE_COORD_MAX);
const CardWidth = z.number().int().min(160).max(1_000);
const GroupSize = z.number().int().min(160).max(4_000);
const CardText = z.string().max(5_000);

export const NoteCardSchema = z.object({
  id: ObjectIdString,
  text: CardText,
  /** Con `groupId`, `x` e `y` son relativas a la esquina del grupo; si no, al lienzo. */
  x: Coord,
  y: Coord,
  w: CardWidth,
  /** Orden de apilado: la última tarjeta movida queda delante. */
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

/** Lo que se pinta en el lienzo: sin las tarjetas hechas hace más de 24 h. */
export const NoteBoardSchema = z.object({
  cards: z.array(NoteCardSchema),
  groups: z.array(NoteGroupSchema),
});
export type NoteBoard = z.infer<typeof NoteBoardSchema>;

/** Sin `x`/`y` el servidor elige el primer hueco libre (captura rápida, móvil). */
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
    /** `true` fija `doneAt` (una vez); `false` lo borra. */
    done: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que actualizar');
export type UpdateNoteCard = z.infer<typeof UpdateNoteCardSchema>;

/** Mover varias tarjetas de una vez (p. ej. al agrupar una selección). */
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
  .refine((value) => Object.keys(value).length > 0, 'No hay nada que actualizar');
export type UpdateNoteGroup = z.infer<typeof UpdateNoteGroupSchema>;
