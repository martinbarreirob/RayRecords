import { z } from 'zod';
import { ItemSchema } from './item';

/** An item with a date, plus its list name so the calendar can render it without extra queries. */
export const CalendarEntrySchema = ItemSchema.extend({
  listName: z.string(),
  listSlug: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;
