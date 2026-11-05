import { z } from 'zod';
import { DateOnlySchema, IsoDateTime, ObjectIdString, TimeSchema } from './common';
import { ItemSchema } from './item';

/**
 * An event that lives only in the calendar. It does not belong to any list: lists are for things
 * to do or remember "some day", events are things with a date.
 */
export const EventSchema = z.object({
  id: ObjectIdString,
  title: z.string().trim().min(1).max(300),
  date: DateOnlySchema,
  time: TimeSchema.optional(),
  doneAt: IsoDateTime.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type CalendarEvent = z.infer<typeof EventSchema>;

export const CreateEventSchema = EventSchema.pick({ title: true, date: true, time: true });
export type CreateEvent = z.infer<typeof CreateEventSchema>;

/** In a partial update, `null` clears the time. */
export const UpdateEventSchema = CreateEventSchema.partial().extend({
  time: TimeSchema.nullable().optional(),
  done: z.boolean().optional(),
});
export type UpdateEvent = z.infer<typeof UpdateEventSchema>;

/**
 * What the calendar draws: a dated list item (`kind: 'item'`, with its list) or an event of its
 * own (`kind: 'event'`, no list). Both use `dueDate` so the grid treats them the same.
 */
export const CalendarEntrySchema = ItemSchema.pick({
  id: true,
  title: true,
  time: true,
  doneAt: true,
}).extend({
  kind: z.enum(['item', 'event']),
  dueDate: DateOnlySchema,
  listName: z.string().optional(),
  listSlug: z.string().optional(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;
