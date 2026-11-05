import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { migrateDailyNotes } from '../modules/note-cards/migrate';

/**
 * Converts the old daily notes into canvas cards.
 *   pnpm --filter @rayrecords/api migrate-notes [--force]
 *   docker compose exec api node dist/cli/migrate-notes.js [--force]
 * Without `--force` it does nothing if cards already exist, so running it twice does not duplicate.
 */
async function main() {
  const force = process.argv.includes('--force');
  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);
    const result = await migrateDailyNotes(database.collections, new Date(), { force });
    console.log(
      result.skippedBecauseNotEmpty
        ? 'Cards already exist: nothing migrated (use --force to migrate anyway).'
        : `Daily notes migrated to cards: ${result.migrated}.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
