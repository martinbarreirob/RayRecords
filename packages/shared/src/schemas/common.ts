import { z } from 'zod';
import { isValidDateOnly } from '../dates';

export const ObjectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido');

export const DateOnlySchema = z
  .string()
  .refine(isValidDateOnly, 'Fecha inválida, se espera YYYY-MM-DD');

export const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido, se espera YYYY-MM');

export const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida, se espera HH:mm');

export const IsoDateTime = z.iso.datetime();

/** Importes siempre en céntimos enteros: nunca floats. */
export const Cents = z.number().int().safe();

/** Solo http(s): evita `javascript:` y similares al renderizar enlaces. */
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const TagSchema = z.string().trim().toLowerCase().min(1).max(40);

/** Claves de campo: sin `$` ni `.` para no abrir la puerta a operadores de Mongo. */
export const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9_]{0,39}$/;
export const FieldKey = z.string().regex(FIELD_KEY_RE);

/** Valor del campo "extra": escalares planos, sin objetos anidados. */
export const ExtraValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
export const ExtraSchema = z.record(FieldKey, ExtraValue);
export type Extra = z.infer<typeof ExtraSchema>;
