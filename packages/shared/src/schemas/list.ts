import { z } from 'zod';
import { FieldKey, IsoDateTime, ObjectIdString } from './common';

/**
 * Una lista es autodescriptiva: lleva sus propias definiciones de campo (`fieldDefs`) y,
 * si es un tablero, sus columnas. Crear un tipo nuevo de lista es crear datos, no código.
 * `kind` solo indica de qué plantilla (preset) partió; no condiciona el comportamiento.
 */
export const FieldType = z.enum([
  'text',
  'number',
  'money', // se guarda en céntimos
  'select',
  'rating',
  'date',
  'url',
  'boolean',
]);
export type FieldType = z.infer<typeof FieldType>;

export const FieldDef = z.object({
  key: FieldKey,
  label: z.string().trim().min(1).max(60),
  type: FieldType,
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});
export type FieldDef = z.infer<typeof FieldDef>;

export const BoardColumn = z.object({
  key: FieldKey,
  label: z.string().trim().min(1).max(60),
});
export type BoardColumn = z.infer<typeof BoardColumn>;

export const ListKind = z.enum(['media', 'shopping', 'board', 'free']);
export type ListKind = z.infer<typeof ListKind>;

/** Alias de captura rápida: letras/dígitos, sin espacios (`peli`, `compra`…). */
export const CaptureAlias = z.string().regex(/^[a-z][a-z0-9]{1,19}$/);

export const ListSchema = z.object({
  id: ObjectIdString,
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: ListKind,
  icon: z.string().max(40).optional(),
  captureAlias: CaptureAlias.optional(),
  fieldDefs: z.array(FieldDef).max(30),
  board: z.object({ columns: z.array(BoardColumn).min(1).max(12) }).optional(),
  order: z.number(),
  archived: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type List = z.infer<typeof ListSchema>;

export const CreateListSchema = ListSchema.pick({
  name: true,
  kind: true,
  icon: true,
  captureAlias: true,
  fieldDefs: true,
  board: true,
}).extend({
  fieldDefs: z.array(FieldDef).max(30).default([]),
});
export type CreateList = z.infer<typeof CreateListSchema>;

export const UpdateListSchema = CreateListSchema.partial().extend({
  /** Sin valor por defecto: un PATCH que no los menciona no debe vaciar los campos de la lista. */
  fieldDefs: z.array(FieldDef).max(30).optional(),
  /** `null` quita el alias de captura. */
  captureAlias: CaptureAlias.nullable().optional(),
  archived: z.boolean().optional(),
  order: z.number().optional(),
});
export type UpdateList = z.infer<typeof UpdateListSchema>;
