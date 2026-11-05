import { BANK_RULES, DEFAULT_CATEGORIES, LEGACY_CATEGORY_MAP } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import { applyRulesToUncategorized, backfillMerchantKeys } from './apply-rules';

export interface CatalogSyncResult {
  categoriesAdded: number;
  /** Transactions and rules moved from an old category to its replacement (or back to review). */
  migrated: number;
  rulesAdded: number;
  merchantKeysFilled: number;
  categorized: number;
}

/**
 * Brings the database up to date with the catalog. Idempotent and additive only: missing
 * categories and rules (an existing rule is not recreated), `merchantKey` on older transactions, and
 * a rule-based category for those still without one. Never touches what was corrected by hand.
 */
export async function syncCatalog(c: Collections): Promise<CatalogSyncResult> {
  const categories = await c.categories.bulkWrite(
    DEFAULT_CATEGORIES.map(({ key, ...rest }) => ({
      updateOne: { filter: { _id: key }, update: { $setOnInsert: rest }, upsert: true },
    })),
  );
  const migrated = await migrateLegacyCategories(c);
  const rules = await c.rules.bulkWrite(
    BANK_RULES.map((rule) => ({
      updateOne: {
        filter: { pattern: rule.pattern, matchType: rule.matchType },
        update: { $setOnInsert: { _id: new ObjectId(), ...rule } },
        upsert: true,
      },
    })),
  );

  const merchantKeysFilled = await backfillMerchantKeys(c);
  const categorized = await applyRulesToUncategorized(c);
  return {
    categoriesAdded: categories.upsertedCount,
    migrated,
    rulesAdded: rules.upsertedCount,
    merchantKeysFilled,
    categorized,
  };
}

/**
 * Moves whatever uses a category from earlier versions to its replacement and deletes the old
 * category. With no replacement (`null`) transactions go back to pending and their rules are deleted.
 * User-created categories are not in the map and are left alone.
 */
async function migrateLegacyCategories(c: Collections): Promise<number> {
  let migrated = 0;
  for (const [legacy, target] of Object.entries(LEGACY_CATEGORY_MAP)) {
    const transactions = await c.transactions.updateMany(
      { category: legacy },
      target === null
        ? { $set: { category: null, categorySource: 'none' } }
        : { $set: { category: target } },
    );
    const rules =
      target === null
        ? await c.rules.deleteMany({ categoryKey: legacy })
        : await c.rules.updateMany({ categoryKey: legacy }, { $set: { categoryKey: target } });
    migrated +=
      transactions.modifiedCount +
      ('modifiedCount' in rules ? rules.modifiedCount : rules.deletedCount);
    await c.categories.deleteOne({ _id: legacy });
  }
  return migrated;
}
