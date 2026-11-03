import { z } from 'zod';
import { DateOnlySchema, IsoDateTime, ObjectIdString } from './common';

/** Una nota libre (markdown) por fecha. */
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
