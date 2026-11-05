import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { migrateDailyNotes } from '../modules/note-cards/migrate';

/**
 * Convierte las notas del día antiguas en tarjetas del lienzo.
 *   pnpm --filter @rayrecords/api migrate-notes [--force]
 *   docker compose exec api node dist/cli/migrate-notes.js [--force]
 * Sin `--force` no hace nada si ya existen tarjetas (así no se duplican al repetirlo).
 */
async function main() {
  const force = process.argv.includes('--force');
  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);
    const result = await migrateDailyNotes(database.collections, new Date(), { force });
    console.log(
      result.skippedBecauseNotEmpty
        ? 'Ya hay tarjetas: no se ha migrado nada (usa --force para migrar igualmente).'
        : `Notas del día migradas a tarjetas: ${result.migrated}.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
