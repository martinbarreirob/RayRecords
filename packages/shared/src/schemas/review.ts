import { z } from 'zod';
import { Cents, DateOnlySchema, FieldKey, ObjectIdString } from './common';

/** Category suggested for a group; `source` says where it comes from (to sort and explain). */
export const SuggestionSchema = z.object({
  category: FieldKey,
  /** `history`: what was already chosen for this merchant. `rule`: a rule. `hint`: a heuristic. `popular`: the most used. */
  source: z.enum(['history', 'rule', 'hint', 'popular']),
  /** How many already categorized transactions back the suggestion (0 if not applicable). */
  count: z.number().int().nonnegative(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** A pending group: all uncategorized transactions of the same merchant. */
export const ReviewGroupSchema = z.object({
  /** Merchant key; `null` if there is none (the group is a single transaction, identified by `ids`). */
  merchantKey: z.string().nullable(),
  /** Ids of the pending transactions in the group (up to 500). */
  ids: z.array(ObjectIdString),
  count: z.number().int().positive(),
  /** Signed sum, in cents. */
  totalCents: Cents,
  minCents: Cents,
  maxCents: Cents,
  /** Original description of a sample transaction. */
  sampleDescription: z.string(),
  firstDate: DateOnlySchema,
  lastDate: DateOnlySchema,
  /** Amounts of the latest transactions in the group, newest first (max 4). */
  recentCents: z.array(Cents),
  suggestions: z.array(SuggestionSchema),
});
export type ReviewGroup = z.infer<typeof ReviewGroupSchema>;

export const ReviewQueueSchema = z.object({
  groups: z.array(ReviewGroupSchema),
  /** How many transactions each category has, most to least: orders the review cards. */
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
  /** Creates a rule for the merchant for future statements (skipped if it is not safe). */
  createRule: z.boolean().default(true),
});
export type ReviewApply = z.infer<typeof ReviewApplySchema>;

export const ReviewApplyResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  ruleId: ObjectIdString.nullable(),
  /** Why the requested rule was not created (to show on screen). */
  ruleSkippedReason: z.string().nullable(),
});
export type ReviewApplyResult = z.infer<typeof ReviewApplyResultSchema>;

export const ReviewUndoSchema = z.object({
  ids: z.array(ObjectIdString).min(1).max(500),
  ruleId: ObjectIdString.nullable().default(null),
});
export type ReviewUndo = z.infer<typeof ReviewUndoSchema>;
