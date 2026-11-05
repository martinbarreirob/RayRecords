import { z } from 'zod';
import { CreateAccountSchema } from './account';
import { CategorySchema, CreateRuleSchema } from './category';
import { Cents, FieldKey, IsoDateTime, MonthSchema, ObjectIdString } from './common';
import { TransactionSchema } from './transaction';

export const UpdateAccountSchema = CreateAccountSchema.partial().extend({
  // No defaults: a partial PATCH must not reset the currency or the opening balance.
  currency: z.string().length(3).optional(),
  openingBalanceCents: Cents.optional(),
  archived: z.boolean().optional(),
});
export type UpdateAccount = z.infer<typeof UpdateAccountSchema>;

export const UpdateCategorySchema = CategorySchema.omit({ key: true }).partial();
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;

export const UpdateRuleSchema = CreateRuleSchema.partial().extend({
  // No defaults: editing the pattern must not reset the priority or reactivate the rule.
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type UpdateRule = z.infer<typeof UpdateRuleSchema>;

export const TransactionQuerySchema = z.object({
  accountId: ObjectIdString.optional(),
  month: MonthSchema.optional(),
  /** Category key, or `none` for transactions without one. */
  category: z.union([FieldKey, z.literal('none')]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;

export const TransactionPageSchema = z.object({
  items: z.array(TransactionSchema),
  total: z.number().int().nonnegative(),
});
export type TransactionPage = z.infer<typeof TransactionPageSchema>;

export const ImportBatchSchema = z.object({
  id: ObjectIdString,
  accountId: ObjectIdString.optional(),
  fileName: z.string(),
  imported: z.number().int(),
  skipped: z.number().int(),
  createdAt: IsoDateTime,
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

/** Result of importing a statement (or its preview, with `dryRun`). */
export const ImportResultSchema = z.object({
  dryRun: z.boolean(),
  batchId: ObjectIdString.optional(),
  fileName: z.string(),
  /** Valid rows read from the file. */
  parsed: z.number().int(),
  /** New rows (or the ones that would be imported, in a preview). */
  imported: z.number().int(),
  /** Duplicates that already exist, not imported. */
  skipped: z.number().int(),
  uncategorized: z.number().int(),
  warnings: z.array(z.string()),
  preview: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amountCents: z.number().int(),
      category: FieldKey.nullable(),
      duplicate: z.boolean(),
    }),
  ),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const SummaryQuerySchema = z.object({
  from: MonthSchema,
  to: MonthSchema,
  accountId: ObjectIdString.optional(),
  type: z.enum(['expense', 'income']).default('expense'),
});
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;
