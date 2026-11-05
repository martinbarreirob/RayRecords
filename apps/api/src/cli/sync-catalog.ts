import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { syncCatalog } from '../modules/expenses/catalog-sync';

/**
 * Añade las categorías y reglas del extracto real y rellena la clave de comercio de los movimientos.
 *   pnpm --filter @rayrecords/api sync-catalog
 *   docker compose exec api node dist/cli/sync-catalog.js
 * Es idempotente y solo añade: se puede repetir sin miedo.
 */
async function main() {
  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);
    const r = await syncCatalog(database.collections);
    console.log(
      `Categorías nuevas: ${r.categoriesAdded}. Migradas: ${r.migrated}. Reglas nuevas: ${r.rulesAdded}. ` +
        `Movimientos con comercio calculado: ${r.merchantKeysFilled}. Categorizados por regla: ${r.categorized}.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
