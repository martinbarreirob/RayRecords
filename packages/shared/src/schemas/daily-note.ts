import { z } from 'zod';
import { DateOnlySchema, IsoDateTime, ObjectIdString } from './common';

/** One free-form (markdown) note per date. */
export const DailyNoteSchema = z.object({
  id: ObjectIdString,
  date: DateOnlySchema,
  content: z.string().max(100_000),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type DailyNote = z.infer<typeof DailyNoteSchema>;

export const UpsertDailyNoteSchema = DailyNoteSchema.pick({ content: true });
export type UpsertDailyNote = z.infer<typeof UpsertDailyNoteSchema>;

/** What the API returns: a date without a note looks like an empty note (`updatedAt: null`), not a 404. */
export const NoteViewSchema = z.object({
  date: DateOnlySchema,
  content: z.string(),
  updatedAt: IsoDateTime.nullable(),
});
export type NoteView = z.infer<typeof NoteViewSchema>;

export const AppendNoteSchema = z.object({ text: z.string().trim().min(1).max(5_000) });
export type AppendNote = z.infer<typeof AppendNoteSchema>;
