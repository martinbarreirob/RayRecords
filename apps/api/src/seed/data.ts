import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  DEFAULT_TIME_ZONE,
  addDays,
  todayIn,
} from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../db/client';
import type { AccountDoc, ImportBatchDoc, TransactionDoc } from '../db/documents';
import { prepareTransactions } from '../modules/expenses/prepare';
import { buildCatalog } from './catalog';
import { createRng } from './rng';
import { buildStock } from './stock';
import { generateCheckingTransactions, withRunningBalance } from './transactions';

export interface SeedCounts {
  categories: number;
  rules: number;
  lists: number;
  items: number;
  history: number;
  events: number;
  notes: number;
  noteGroups: number;
  products: number;
  stockCategories: number;
  tickets: number;
  accounts: number;
  transactions: number;
}

/**
 * Fills the data collections of `c` with the sample data (everything but the user). The collections
 * must be empty: callers wipe them first (the dev seeder drops the database; the demo CLI clears the
 * `demo_*` collections, including the default catalog created when they were opened).
 */
export async function seedData(c: Collections, now = new Date()): Promise<SeedCounts> {
  const today = todayIn(DEFAULT_TIME_ZONE, now);

  // Categories and rules
  await c.categories.insertMany(
    DEFAULT_CATEGORIES.map(({ key, ...rest }) => ({ _id: key, ...rest })),
  );
  await c.rules.insertMany(DEFAULT_RULES.map((rule) => ({ _id: new ObjectId(), ...rule })));

  // Lists, items and notes
  const catalog = buildCatalog(now, today);
  await c.lists.insertMany(catalog.lists);
  await c.items.insertMany(catalog.items);
  await c.itemHistory.insertMany(catalog.history);
  await c.events.insertMany(catalog.events);
  await c.noteGroups.insertMany(catalog.noteGroups);
  await c.noteCards.insertMany(catalog.noteCards);

  // Stock, sales and tickets (its own generator, so it does not shift the transactions)
  const stock = buildStock(now, createRng(2026));
  const { tickets } = stock;
  await c.stockCategories.insertMany(stock.categories);
  await c.products.insertMany(stock.products);
  await c.tickets.insertMany(tickets);

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

  return {
    categories: DEFAULT_CATEGORIES.length,
    rules: DEFAULT_RULES.length,
    lists: catalog.lists.length,
    items: catalog.items.length,
    history: catalog.history.length,
    events: catalog.events.length,
    notes: catalog.noteCards.length,
    noteGroups: catalog.noteGroups.length,
    products: stock.products.length,
    stockCategories: stock.categories.length,
    tickets: tickets.length,
    accounts: 1,
    transactions: checkingDocs.length,
  };
}

export function formatSeedCounts(n: SeedCounts): string {
  return [
    `  categories:    ${n.categories}`,
    `  rules:         ${n.rules}`,
    `  lists:         ${n.lists}`,
    `  items:         ${n.items} (with ${n.history} history entries)`,
    `  events:        ${n.events} (the «Eventos» list)`,
    `  notes:         ${n.notes} (in ${n.noteGroups} group)`,
    `  products:      ${n.products} (in ${n.stockCategories} categories)`,
    `  tickets:       ${n.tickets}`,
    `  accounts:      ${n.accounts}`,
    `  transactions:  ${n.transactions}`,
  ].join('\n');
}
