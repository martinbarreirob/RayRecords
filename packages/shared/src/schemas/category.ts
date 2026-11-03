import { z } from 'zod';
import { FieldKey, ObjectIdString } from './common';

/** La clave (`supermercado`, `ocio`…) es el identificador; no hay id aparte. */
export const CategorySchema = z.object({
  key: FieldKey,
  name: z.string().trim().min(1).max(60),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});
export type Category = z.infer<typeof CategorySchema>;

export const RuleMatchType = z.enum(['contains', 'startsWith', 'regex']);
export type RuleMatchType = z.infer<typeof RuleMatchType>;

/** Regla de categorización sobre la descripción normalizada (minúsculas, sin acentos). */
export const CategorizationRuleSchema = z.object({
  id: ObjectIdString,
  pattern: z.string().trim().min(1).max(200),
  matchType: RuleMatchType,
  categoryKey: FieldKey,
  /** Mayor prioridad se evalúa antes; gana la primera que coincide. */
  priority: z.number().int(),
  active: z.boolean(),
});
export type CategorizationRule = z.infer<typeof CategorizationRuleSchema>;

export const CreateRuleSchema = CategorizationRuleSchema.omit({ id: true }).extend({
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CreateRule = z.infer<typeof CreateRuleSchema>;
