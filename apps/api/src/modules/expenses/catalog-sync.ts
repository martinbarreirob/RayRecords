import { BANK_RULES, DEFAULT_CATEGORIES, LEGACY_CATEGORY_MAP } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import { applyRulesToUncategorized, backfillMerchantKeys } from './apply-rules';

export interface CatalogSyncResult {
  categoriesAdded: number;
  /** Movimientos y reglas pasados de una categoría antigua a su sustituta (o a revisión). */
  migrated: number;
  rulesAdded: number;
  merchantKeysFilled: number;
  categorized: number;
}

/**
 * Deja la base al día con el catálogo del extracto real. Es idempotente y solo AÑADE:
 * categorías y reglas que faltan (no recrea una regla que ya existe), `merchantKey` en movimientos
 * anteriores y categoría por regla a los que siguen sin ella. Nunca toca lo corregido a mano.
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
 * Pasa lo que use una categoría de versiones anteriores a su sustituta y borra la categoría antigua.
 * Si no tiene sustituta (`null`) los movimientos vuelven a pendientes y sus reglas se borran.
 * Las categorías creadas por el usuario no están en el mapa y no se tocan.
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
