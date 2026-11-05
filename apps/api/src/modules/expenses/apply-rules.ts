import type { AnyBulkWriteOperation } from 'mongodb';
import type { Collections } from '../../db/client';
import type { TransactionDoc } from '../../db/documents';
import { categorize } from './categorize';
import { merchantKey } from './merchant';

const BATCH = 500;

/** Escribe en lotes lo que va devolviendo un recorrido, para no cargar la colección entera en memoria. */
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
 * Reaplica las reglas activas a los movimientos sin categoría y devuelve cuántos cambiaron.
 * Nunca toca los corregidos a mano.
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

/** Calcula `merchantKey` en los movimientos anteriores a esa columna y devuelve cuántos rellenó. */
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
