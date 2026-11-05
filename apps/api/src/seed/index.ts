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
 * Seeder de desarrollo y demo: BORRA la base de datos y la rellena con datos de ejemplo.
 * Se niega a ejecutarse contra cualquier BD cuyo nombre no termine en _dev o _demo, y en producción,
 * para que sea imposible apuntarlo por error a los datos reales.
 */
function abort(reason: string): never {
  console.error(`Seeder cancelado: ${reason}.`);
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  if (config.nodeEnv === 'production') abort('NODE_ENV=production');
  if (!/_(dev|demo)$/.test(config.mongoDb)) {
    abort(`la base de datos "${config.mongoDb}" no termina en _dev ni _demo`);
  }

  const database = await connectDatabase(config);
  try {
    const { collections: c } = database;
    const now = new Date();
    const today = todayIn(DEFAULT_TIME_ZONE, now);

    console.log(`Sembrando "${config.mongoDb}"…`);
    // Las colecciones de acceso se conservan al vaciar y el usuario de desarrollo se recrea después.
    const keep = new Set(['users', 'sessions', 'credentials']);
    for (const { name } of await database.db.listCollections({}, { nameOnly: true }).toArray()) {
      if (!keep.has(name)) await database.db.dropCollection(name);
    }
    await ensureIndexes(c);

    const username = await seedUser(c, process.env);

    // Categorías y reglas
    await c.categories.insertMany(
      DEFAULT_CATEGORIES.map(({ key, ...rest }) => ({ _id: key, ...rest })),
    );
    await c.rules.insertMany(DEFAULT_RULES.map((rule) => ({ _id: new ObjectId(), ...rule })));

    // Listas, elementos y notas del día
    const catalog = buildCatalog(now, today);
    await c.lists.insertMany(catalog.lists);
    await c.items.insertMany(catalog.items);
    await c.noteGroups.insertMany(catalog.noteGroups);
    await c.noteCards.insertMany(catalog.noteCards);

    // Cuentas y transacciones
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

    // Una corrección manual de ejemplo: la ferretería no tiene regla y se asigna a mano a "hogar".
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
        `  categorías:    ${DEFAULT_CATEGORIES.length}`,
        `  reglas:        ${DEFAULT_RULES.length}`,
        `  listas:        ${catalog.lists.length}`,
        `  elementos:     ${catalog.items.length}`,
        `  notas:         ${catalog.noteCards.length} (en ${catalog.noteGroups.length} grupo)`,
        `  cuentas:       1`,
        `  usuario:       ${username}`,
        `  transacciones: ${checkingDocs.length}`,
      ].join('\n'),
    );
    console.log('Listo.');
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
