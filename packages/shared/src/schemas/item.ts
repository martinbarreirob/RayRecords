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
  /** Fecha límite o fecha del evento; alimenta el calendario. */
  dueDate: DateOnlySchema.optional(),
  time: TimeSchema.optional(),
  url: HttpUrl.optional(),
  /** Datos específicos de la lista (precio, año, estado, puntuación…), definidos por `list.fieldDefs`. */
  extra: ExtraSchema,
  /** Columna del tablero, solo en listas con `board`. */
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

export const UpdateItemSchema = CreateItemSchema.omit({ listId: true, source: true })
  .partial()
  .extend({
    order: z.number().optional(),
    done: z.boolean().optional(),
  });
export type UpdateItem = z.infer<typeof UpdateItemSchema>;
