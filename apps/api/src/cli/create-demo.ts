import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { upsertUser } from '../modules/auth/users';
import { formatSeedCounts, seedData } from '../seed/data';

/**
 * Creates or refreshes the public demo user (demo / demo) with sample data in its own `demo_*`
 * collections. Safe to run on the production server: it only touches `demo_*` collections and the
 * demo user, never unprefixed data nor other users.
 *   pnpm --filter @rayrecords/api create-demo
 *   docker compose exec api node dist/cli/create-demo.js
 */
const USERNAME = 'demo';
const PASSWORD = 'demo';
const PREFIX = 'demo_';

async function main() {
  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);

    // A demo user without the prefix (or with another one) points at real data: do not touch it.
    const existing = await database.collections.users.findOne({ username: USERNAME });
    if (existing && existing.dataPrefix !== PREFIX) {
      throw new Error(
        `Aborted: user "${USERNAME}" exists with data prefix ${
          existing.dataPrefix === undefined ? '(none)' : `"${existing.dataPrefix}"`
        }, not "${PREFIX}". It may point at real data; rename or remove it first.`,
      );
    }

    await upsertUser(database.collections, USERNAME, PASSWORD, {
      dataPrefix: PREFIX,
      allowWeakPassword: true,
    });

    // Opens the demo collections (indexes and default catalog) and wipes only those.
    const c = await database.forUser(PREFIX);
    const own = [
      c.lists,
      c.items,
      c.itemHistory,
      c.events,
      c.dailyNotes,
      c.noteCards,
      c.noteGroups,
      c.accounts,
      c.transactions,
      c.categories,
      c.rules,
      c.importBatches,
      c.products,
      c.stockCategories,
      c.tickets,
    ];
    for (const collection of own) {
      if (!collection.collectionName.startsWith(PREFIX)) {
        throw new Error(`Aborted: "${collection.collectionName}" is not a ${PREFIX}* collection`);
      }
      await collection.deleteMany({});
    }

    const counts = await seedData(c);

    const user = await database.collections.users.findOne({ username: USERNAME });
    if (user) await database.collections.sessions.deleteMany({ userId: user._id });

    console.log(`Demo user "${USERNAME}" ready (data in ${PREFIX}* collections).`);
    console.log(formatSeedCounts(counts));
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
