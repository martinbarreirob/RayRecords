import { z } from 'zod';
import { ItemSchema } from './item';

/** Un elemento con fecha, con el nombre de su lista para pintarlo en el calendario sin más consultas. */
export const CalendarEntrySchema = ItemSchema.extend({
  listName: z.string(),
  listSlug: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;
