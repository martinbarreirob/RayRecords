import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  DEFAULT_TIME_ZONE,
  addDays,
  todayIn,
} from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import type { AccountDoc, ImportBatchDoc, TransactionDoc } from '../db/documents';
import { ensureIndexes } from '../db/indexes';
import { prepareTransactions } from '../modules/expenses/prepare';
import { buildCatalog } from './catalog';
import { createRng } from './rng';
import { seedUser } from './user';
import { generateCheckingTransactions, withRunningBalance } from './transactions';

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
    const now = new Date();
    const today = todayIn(DEFAULT_TIME_ZONE, now);

    console.log(`Seeding "${config.mongoDb}"...`);
    // Auth collections are kept when wiping; the development user is recreated afterwards.
    const keep = new Set(['users', 'sessions', 'credentials']);
    for (const { name } of await database.db.listCollections({}, { nameOnly: true }).toArray()) {
      if (!keep.has(name)) await database.db.dropCollection(name);
    }
    await ensureIndexes(c);

    const username = await seedUser(c, process.env);

    // Categories and rules
    await c.categories.insertMany(
      DEFAULT_CATEGORIES.map(({ key, ...rest }) => ({ _id: key, ...rest })),
    );
    await c.rules.insertMany(DEFAULT_RULES.map((rule) => ({ _id: new ObjectId(), ...rule })));

    // Lists, items and notes
    const catalog = buildCatalog(now, today);
    await c.lists.insertMany(catalog.lists);
    await c.items.insertMany(catalog.items);
    await c.noteGroups.insertMany(catalog.noteGroups);
    await c.noteCards.insertMany(catalog.noteCards);

    // Accounts and transactions
    const rng = createRng(42);
    const checkingRows = generateCheckingTransactions(today, rng);
    const openingDate = addDays(checkingRows[0]!.date, -1);

    const checking: AccountDoc = {
      _id: new ObjectId(),
      name: 'Cuenta',
      bank: 'Banco Demo',
      type: 'checking',
      currency: 'EUR',
      openingBalanceCents: 125_000,
      openingDate,
      archived: false,
      createdAt: now,
    };
    await c.accounts.insertOne(checking);

    const batch: ImportBatchDoc = {
      _id: new ObjectId(),
      fileName: 'extracto-demo.csv',
      imported: checkingRows.length,
      skipped: 0,
      createdAt: now,
    };
    await c.importBatches.insertOne(batch);

    const checkingDocs: TransactionDoc[] = prepareTransactions({
      accountId: checking._id,
      rows: withRunningBalance(checkingRows, checking.openingBalanceCents),
      rules: DEFAULT_RULES,
      importBatchId: batch._id,
    }).map((doc) => ({ _id: new ObjectId(), ...doc }));

    // A sample manual correction: the hardware store has no rule and is assigned to "hogar" by hand.
    const corrected = checkingDocs.find(
      (t) => t.category === null && t.description.includes('FERRETERIA'),
    );
    if (corrected) {
      corrected.category = 'hogar';
      corrected.categorySource = 'manual';
    }

    await c.transactions.insertMany(checkingDocs);

    console.log(
      [
        `  categories:    ${DEFAULT_CATEGORIES.length}`,
        `  rules:         ${DEFAULT_RULES.length}`,
        `  lists:         ${catalog.lists.length}`,
        `  items:         ${catalog.items.length}`,
        `  notes:         ${catalog.noteCards.length} (in ${catalog.noteGroups.length} group)`,
        `  accounts:      1`,
        `  user:          ${username}`,
        `  transactions:  ${checkingDocs.length}`,
      ].join('\n'),
    );
    console.log('Done.');
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
