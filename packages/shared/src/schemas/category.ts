import { z } from 'zod';
import { FieldKey, ObjectIdString } from './common';

/** The key (`hogar`, `ocio`...) is the identifier; there is no separate id. */
export const CategorySchema = z.object({
  key: FieldKey,
  name: z.string().trim().min(1).max(60),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});
export type Category = z.infer<typeof CategorySchema>;

export const RuleMatchType = z.enum(['contains', 'startsWith', 'regex']);
export type RuleMatchType = z.infer<typeof RuleMatchType>;

/** Categorization rule applied to the normalized description (lowercase, no accents). */
export const CategorizationRuleSchema = z.object({
  id: ObjectIdString,
  pattern: z.string().trim().min(1).max(200),
  matchType: RuleMatchType,
  categoryKey: FieldKey,
  /** Higher priority is evaluated first; the first match wins. */
  priority: z.number().int(),
  active: z.boolean(),
});
export type CategorizationRule = z.infer<typeof CategorizationRuleSchema>;

export const CreateRuleSchema = CategorizationRuleSchema.omit({ id: true }).extend({
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CreateRule = z.infer<typeof CreateRuleSchema>;
