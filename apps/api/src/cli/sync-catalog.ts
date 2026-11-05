import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { syncCatalog } from '../modules/expenses/catalog-sync';

/**
 * Adds the categories and rules derived from the real statement and fills in the merchant key of transactions.
 *   pnpm --filter @rayrecords/api sync-catalog
 *   docker compose exec api node dist/cli/sync-catalog.js
 * Idempotent and additive only: safe to run again.
 */
async function main() {
  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);
    const r = await syncCatalog(database.collections);
    console.log(
      `New categories: ${r.categoriesAdded}. Migrated: ${r.migrated}. New rules: ${r.rulesAdded}. ` +
        `Transactions with merchant key filled: ${r.merchantKeysFilled}. Categorized by rule: ${r.categorized}.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
