import { z } from 'zod';
import {
  DateOnlySchema,
  ExtraSchema,
  FieldKey,
  HttpUrl,
  IsoDateTime,
  ObjectIdString,
  TagSchema,
  TimeSchema,
} from './common';

export const ItemSource = z.enum(['manual', 'quick', 'import']);
export type ItemSource = z.infer<typeof ItemSource>;

export const ItemSchema = z.object({
  id: ObjectIdString,
  listId: ObjectIdString,
  title: z.string().trim().min(1).max(300),
  text: z.string().max(20_000).optional(),
  tags: z.array(TagSchema).max(30),
  /** Due date or event date; feeds the calendar. */
  dueDate: DateOnlySchema.optional(),
  time: TimeSchema.optional(),
  url: HttpUrl.optional(),
  /** List-specific data (price, year, status, rating...), defined by `list.fieldDefs`. */
  extra: ExtraSchema,
  /** Board column, only for lists with a `board`. */
  column: FieldKey.optional(),
  order: z.number(),
  doneAt: IsoDateTime.optional(),
  source: ItemSource,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Item = z.infer<typeof ItemSchema>;

export const CreateItemSchema = ItemSchema.pick({
  listId: true,
  title: true,
  text: true,
  dueDate: true,
  time: true,
  url: true,
  column: true,
}).extend({
  tags: z.array(TagSchema).max(30).default([]),
  extra: ExtraSchema.default({}),
  source: ItemSource.default('manual'),
});
export type CreateItem = z.infer<typeof CreateItemSchema>;

/** In a partial update, `null` clears the optional value; in `extra`, a key set to `null` is removed. */
export const UpdateItemSchema = CreateItemSchema.omit({ listId: true, source: true })
  .partial()
  .extend({
    // No defaults: a PATCH that does not mention them (e.g. only `done`) must not empty them.
    tags: z.array(TagSchema).max(30).optional(),
    extra: ExtraSchema.optional(),
    text: ItemSchema.shape.text.nullable().optional(),
    dueDate: DateOnlySchema.nullable().optional(),
    time: TimeSchema.nullable().optional(),
    url: HttpUrl.nullable().optional(),
    done: z.boolean().optional(),
  });
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

/**
 * Move or reorder an item: say which item it goes after (`afterId`; `null` = first) and, on a
 * board, which column it goes to. The server computes `order`.
 */
export const MoveItemSchema = z.object({
  afterId: ObjectIdString.nullable(),
  column: FieldKey.optional(),
});
export type MoveItem = z.infer<typeof MoveItemSchema>;
