import type { Transaction } from '@rayrecords/shared';
import type { TransactionDoc } from '../../db/documents';

/** `Date` UTC → `YYYY-MM-DD`. */
export const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export function toTransaction(doc: TransactionDoc): Transaction {
  return {
    id: doc._id.toHexString(),
    accountId: doc.accountId.toHexString(),
    date: toDateOnly(doc.date),
    month: doc.month,
    amountCents: doc.amountCents,
    description: doc.description,
    ...(doc.balanceAfterCents !== undefined && { balanceAfterCents: doc.balanceAfterCents }),
    category: doc.category,
    categorySource: doc.categorySource,
    ...(doc.importBatchId !== undefined && { importBatchId: doc.importBatchId.toHexString() }),
  };
}
