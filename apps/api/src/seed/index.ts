import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { formatSeedCounts, seedData } from './data';
import { seedUser } from './user';

/**
 * Development and demo seeder: DROPS the database and fills it with sample data.
 * It refuses to run against any database whose name does not end in _dev or _demo, and in
 * production, so it cannot be pointed at real data by mistake.
 */
function abort(reason: string): never {
  console.error(`Seeder aborted: ${reason}.`);
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  if (config.nodeEnv === 'production') abort('NODE_ENV=production');
  if (!/_(dev|demo)$/.test(config.mongoDb)) {
    abort(`database "${config.mongoDb}" does not end in _dev or _demo`);
  }

  const database = await connectDatabase(config);
  try {
    const { collections: c } = database;

    console.log(`Seeding "${config.mongoDb}"...`);
    // Auth collections are kept when wiping; the development user is recreated afterwards.
    const keep = new Set(['users', 'sessions', 'credentials']);
    for (const { name } of await database.db.listCollections({}, { nameOnly: true }).toArray()) {
      if (!keep.has(name)) await database.db.dropCollection(name);
    }
    await ensureIndexes(c);

    const username = await seedUser(c, process.env);
    const counts = await seedData(c);

    console.log(`${formatSeedCounts(counts)}\n  user:          ${username}`);
    console.log('Done.');
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
