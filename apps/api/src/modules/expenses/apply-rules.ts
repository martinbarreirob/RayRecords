import type { AnyBulkWriteOperation } from 'mongodb';
import type { Collections } from '../../db/client';
import type { TransactionDoc } from '../../db/documents';
import { categorize } from './categorize';
import { merchantKey } from './merchant';

const BATCH = 500;

/** Writes the operations of a cursor walk in batches, to avoid loading the whole collection in memory. */
async function inBatches(
  c: Collections,
  ops: AsyncIterable<AnyBulkWriteOperation<TransactionDoc>>,
): Promise<void> {
  let batch: AnyBulkWriteOperation<TransactionDoc>[] = [];
  for await (const op of ops) {
    batch.push(op);
    if (batch.length >= BATCH) {
      await c.transactions.bulkWrite(batch);
      batch = [];
    }
  }
  if (batch.length) await c.transactions.bulkWrite(batch);
}

/**
 * Re-applies the active rules to uncategorized transactions and returns how many changed.
 * Never touches the ones corrected by hand.
 */
export async function applyRulesToUncategorized(c: Collections): Promise<number> {
  const rules = await c.rules.find({ active: true }).toArray();
  let updated = 0;
  async function* ops() {
    for await (const doc of c.transactions.find({ categorySource: 'none' })) {
      const category = categorize(doc.descriptionNorm, rules);
      if (category === null) continue;
      updated++;
      yield {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { category, categorySource: 'rule' as const } },
        },
      };
    }
  }
  await inBatches(c, ops());
  return updated;
}

/** Computes `merchantKey` on transactions that predate that column and returns how many it filled. */
export async function backfillMerchantKeys(c: Collections): Promise<number> {
  let filled = 0;
  async function* ops() {
    for await (const doc of c.transactions.find({ merchantKey: { $exists: false } })) {
      filled++;
      yield {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { merchantKey: merchantKey(doc.description) } },
        },
      };
    }
  }
  await inBatches(c, ops());
  return filled;
}
