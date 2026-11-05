import type { DateOnly } from '@rayrecords/shared';
import { monthOf } from '@rayrecords/shared';
import type { ObjectId } from 'mongodb';
import type { TransactionDoc } from '../../db/documents';
import { categorize, type Rule } from './categorize';
import { assignOccurrences, transactionHash } from './hash';
import { merchantKey } from './merchant';
import { normalizeDescription } from './normalize';

/** One already parsed statement row (parsing the bank CSV lives elsewhere). */
export interface RawTransaction {
  date: DateOnly;
  description: string;
  /** Expenses are negative, income positive. */
  amountCents: number;
  balanceAfterCents?: number;
}

/**
 * Turns the rows of ONE statement into documents ready to insert: normalizes the description,
 * computes the dedup hash and applies the categorization rules.
 * Rows must come in file order, since the hash's occurrence number depends on it.
 * Shared by the seeder and the CSV importer.
 */
export function prepareTransactions(params: {
  accountId: ObjectId;
  rows: readonly RawTransaction[];
  rules: readonly Rule[];
  importBatchId?: ObjectId;
}): Omit<TransactionDoc, '_id'>[] {
  const { accountId, rows, rules, importBatchId } = params;
  const prepared = rows.map((row) => ({
    row,
    descriptionNorm: normalizeDescription(row.description),
  }));
  const occurrences = assignOccurrences(
    prepared.map(({ row, descriptionNorm }) => `${row.date}|${row.amountCents}|${descriptionNorm}`),
  );

  return prepared.map(({ row, descriptionNorm }, i) => {
    const category = categorize(descriptionNorm, rules);
    return {
      accountId,
      date: new Date(`${row.date}T00:00:00Z`),
      month: monthOf(row.date),
      amountCents: row.amountCents,
      description: row.description,
      descriptionNorm,
      merchantKey: merchantKey(row.description),
      ...(row.balanceAfterCents !== undefined && { balanceAfterCents: row.balanceAfterCents }),
      hash: transactionHash({
        accountId: accountId.toHexString(),
        date: row.date,
        amountCents: row.amountCents,
        descriptionNorm,
        balanceAfterCents: row.balanceAfterCents ?? null,
        occurrence: occurrences[i]!,
      }),
      category,
      categorySource: category === null ? ('none' as const) : ('rule' as const),
      ...(importBatchId && { importBatchId }),
    };
  });
}
