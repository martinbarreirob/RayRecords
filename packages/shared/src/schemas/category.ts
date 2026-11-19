import { z } from 'zod';
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_COLOR,
} from '../category-look';
import { FieldKey, ObjectIdString } from './common';
import { CategoryIconSchema, CategoryNameSchema, HexColorSchema } from './look';

/**
 * An expense category. The key (`hogar`, `ocio`...) is the identifier; there is no separate id.
 * Shown as an icon on a colored square: `color` is the square and `iconColor` the icon.
 */
export const CategorySchema = z.object({
  key: FieldKey,
  name: CategoryNameSchema,
  icon: CategoryIconSchema,
  color: HexColorSchema,
  iconColor: HexColorSchema,
});
export type Category = z.infer<typeof CategorySchema>;

/** Without a `key` the server makes one from the name; the look has a default. */
export const CreateCategorySchema = z.object({
  key: FieldKey.optional(),
  name: CategoryNameSchema,
  icon: CategoryIconSchema.default(DEFAULT_CATEGORY_ICON),
  color: HexColorSchema.default(DEFAULT_CATEGORY_COLOR),
  iconColor: HexColorSchema.default(DEFAULT_CATEGORY_ICON_COLOR),
});
export type CreateCategory = z.input<typeof CreateCategorySchema>;

/** How many transactions each category holds, by key; categories with none are left out. */
export const CategoryUsageSchema = z.record(FieldKey, z.number().int().nonnegative());
export type CategoryUsage = z.infer<typeof CategoryUsageSchema>;

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
