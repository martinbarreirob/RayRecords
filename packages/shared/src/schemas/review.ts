import { z } from 'zod';
import { Cents, DateOnlySchema, FieldKey, ObjectIdString } from './common';

/** Categoría sugerida para un grupo; `source` dice de dónde sale (para ordenar y explicar). */
export const SuggestionSchema = z.object({
  category: FieldKey,
  /** `history`: lo que ya decidiste para este comercio. `rule`: una regla. `hint`: heurística. `popular`: la más usada. */
  source: z.enum(['history', 'rule', 'hint', 'popular']),
  /** Cuántos movimientos ya categorizados respaldan la sugerencia (0 si no aplica). */
  count: z.number().int().nonnegative(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** Un grupo pendiente: todos los movimientos sin categoría de un mismo comercio. */
export const ReviewGroupSchema = z.object({
  /** Clave de comercio; `null` si no hay (el grupo es un único movimiento y se identifica por `ids`). */
  merchantKey: z.string().nullable(),
  /** Ids de los movimientos pendientes del grupo (hasta 500). */
  ids: z.array(ObjectIdString),
  count: z.number().int().positive(),
  /** Suma con signo, en céntimos. */
  totalCents: Cents,
  minCents: Cents,
  maxCents: Cents,
  /** Descripción original de un movimiento de muestra y su fecha. */
  sampleDescription: z.string(),
  firstDate: DateOnlySchema,
  lastDate: DateOnlySchema,
  /** Importes de los últimos movimientos del grupo, más recientes primero (máx. 4). */
  recentCents: z.array(Cents),
  suggestions: z.array(SuggestionSchema),
});
export type ReviewGroup = z.infer<typeof ReviewGroupSchema>;

export const ReviewQueueSchema = z.object({
  groups: z.array(ReviewGroupSchema),
  /** Cuántos movimientos tiene cada categoría, de más a menos: ordena las tarjetas de la revisión. */
  usage: z.array(z.object({ category: FieldKey, count: z.number().int().nonnegative() })),
  pendingTransactions: z.number().int().nonnegative(),
  pendingGroups: z.number().int().nonnegative(),
});
export type ReviewQueue = z.infer<typeof ReviewQueueSchema>;

export const ReviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  accountId: ObjectIdString.optional(),
});

export const ReviewApplySchema = z.object({
  ids: z.array(ObjectIdString).min(1).max(500),
  category: FieldKey,
  /** Crea una regla por el comercio para los futuros extractos (se omite si no es segura). */
  createRule: z.boolean().default(true),
});
export type ReviewApply = z.infer<typeof ReviewApplySchema>;

export const ReviewApplyResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  ruleId: ObjectIdString.nullable(),
  /** Por qué no se creó la regla pedida (para avisar en pantalla). */
  ruleSkippedReason: z.string().nullable(),
});
export type ReviewApplyResult = z.infer<typeof ReviewApplyResultSchema>;

export const ReviewUndoSchema = z.object({
  ids: z.array(ObjectIdString).min(1).max(500),
  ruleId: ObjectIdString.nullable().default(null),
});
export type ReviewUndo = z.infer<typeof ReviewUndoSchema>;
