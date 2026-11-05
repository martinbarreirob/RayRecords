import { z } from 'zod';
import { Cents, DateOnlySchema, IsoDateTime, ObjectIdString } from './common';

export const AccountType = z.enum(['checking', 'savings', 'card', 'cash']);
export type AccountType = z.infer<typeof AccountType>;

/**
 * The current balance is not stored: it is `openingBalanceCents` plus the sum of its transactions,
 * so it cannot drift out of sync after importing, editing or deleting transactions.
 */
export const AccountSchema = z.object({
  id: ObjectIdString,
  name: z.string().trim().min(1).max(80),
  bank: z.string().trim().max(80).optional(),
  type: AccountType,
  currency: z.string().length(3).default('EUR'),
  openingBalanceCents: Cents,
  openingDate: DateOnlySchema,
  archived: z.boolean(),
  createdAt: IsoDateTime,
});
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountSchema = AccountSchema.omit({
  id: true,
  createdAt: true,
  archived: true,
}).extend({
  openingBalanceCents: Cents.default(0),
});
export type CreateAccount = z.infer<typeof CreateAccountSchema>;

export const AccountSummarySchema = AccountSchema.extend({
  balanceCents: Cents,
  transactionCount: z.number().int().nonnegative(),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
