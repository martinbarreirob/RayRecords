import { z } from 'zod';
import { Cents, DateOnlySchema, FieldKey, MonthSchema, ObjectIdString } from './common';

/** `rule`: assigned by a rule. `manual`: set by the user and never overwritten. */
export const CategorySource = z.enum(['rule', 'manual', 'none']);
export type CategorySource = z.infer<typeof CategorySource>;

/**
 * Transaction DTO. The deduplication hash and the normalized description are API internals and
 * are not sent to the client. Sign convention: expenses are negative, income is positive.
 */
export const TransactionSchema = z.object({
  id: ObjectIdString,
  accountId: ObjectIdString,
  date: DateOnlySchema,
  month: MonthSchema,
  amountCents: Cents,
  description: z.string().min(1).max(500),
  balanceAfterCents: Cents.optional(),
  category: FieldKey.nullable(),
  categorySource: CategorySource,
  importBatchId: ObjectIdString.optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

/** Manual category fix; `createRule` also saves a rule for the future. */
export const SetTransactionCategorySchema = z.object({
  category: FieldKey.nullable(),
  createRule: z.boolean().default(false),
});
export type SetTransactionCategory = z.infer<typeof SetTransactionCategorySchema>;

/** One row of the monthly chart: spending or income aggregated by month and category. */
export const MonthlyCategoryTotalSchema = z.object({
  month: MonthSchema,
  category: FieldKey.nullable(),
  totalCents: Cents,
  count: z.number().int().nonnegative(),
});
export type MonthlyCategoryTotal = z.infer<typeof MonthlyCategoryTotalSchema>;
