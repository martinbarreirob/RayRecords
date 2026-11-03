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
import {
  generateCheckingTransactions,
  generateSavingsTransactions,
  withRunningBalance,
} from './transactions';

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
    await database.db.dropDatabase();
    await ensureIndexes(c);

    // Categorías y reglas
    await c.categories.insertMany(
      DEFAULT_CATEGORIES.map(({ key, ...rest }) => ({ _id: key, ...rest })),
    );
    await c.rules.insertMany(DEFAULT_RULES.map((rule) => ({ _id: new ObjectId(), ...rule })));

    // Listas, elementos y notas del día
    const catalog = buildCatalog(now, today);
    await c.lists.insertMany(catalog.lists);
    await c.items.insertMany(catalog.items);
    await c.dailyNotes.insertMany(catalog.dailyNotes);

    // Cuentas y transacciones
    const rng = createRng(42);
    const checkingRows = generateCheckingTransactions(today, rng);
    const savingsRows = generateSavingsTransactions(today);
    const openingDate = addDays(checkingRows[0]!.date, -1);

    const checking: AccountDoc = {
      _id: new ObjectId(),
      name: 'Cuenta corriente',
      bank: 'Banco Demo',
      type: 'checking',
      currency: 'EUR',
      openingBalanceCents: 125_000,
      openingDate,
      archived: false,
      createdAt: now,
    };
    const savings: AccountDoc = {
      _id: new ObjectId(),
      name: 'Cuenta ahorro',
      bank: 'Banco Demo',
      type: 'savings',
      currency: 'EUR',
      openingBalanceCents: 500_000,
      openingDate,
      archived: false,
      createdAt: now,
    };
    await c.accounts.insertMany([checking, savings]);

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

    // Una corrección manual de ejemplo: la ferretería no tiene regla y se asigna a mano a "vivienda".
    const corrected = checkingDocs.find(
      (t) => t.category === null && t.description.includes('FERRETERIA'),
    );
    if (corrected) {
      corrected.category = 'vivienda';
      corrected.categorySource = 'manual';
    }

    const savingsDocs: TransactionDoc[] = prepareTransactions({
      accountId: savings._id,
      rows: withRunningBalance(savingsRows, savings.openingBalanceCents),
      rules: DEFAULT_RULES,
    }).map((doc) => ({ _id: new ObjectId(), ...doc }));

    await c.transactions.insertMany([...checkingDocs, ...savingsDocs]);

    console.log(
      [
        `  categorías:    ${DEFAULT_CATEGORIES.length}`,
        `  reglas:        ${DEFAULT_RULES.length}`,
        `  listas:        ${catalog.lists.length}`,
        `  elementos:     ${catalog.items.length}`,
        `  notas del día: ${catalog.dailyNotes.length}`,
        `  cuentas:       2`,
        `  transacciones: ${checkingDocs.length + savingsDocs.length}`,
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
