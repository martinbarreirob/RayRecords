import { MongoClient, type Db } from 'mongodb';
import type { Config } from '../config';
import type {
  AccountDoc,
  CategoryDoc,
  DailyNoteDoc,
  ImportBatchDoc,
  ItemDoc,
  ListDoc,
  RuleDoc,
  TransactionDoc,
} from './documents';

export function getCollections(db: Db) {
  return {
    lists: db.collection<ListDoc>('lists'),
    items: db.collection<ItemDoc>('items'),
    dailyNotes: db.collection<DailyNoteDoc>('daily_notes'),
    accounts: db.collection<AccountDoc>('accounts'),
    transactions: db.collection<TransactionDoc>('transactions'),
    categories: db.collection<CategoryDoc>('categories'),
    rules: db.collection<RuleDoc>('categorization_rules'),
    importBatches: db.collection<ImportBatchDoc>('import_batches'),
  };
}

export type Collections = ReturnType<typeof getCollections>;

export interface Database {
  client: MongoClient;
  db: Db;
  collections: Collections;
  close(): Promise<void>;
}

export async function connectDatabase(
  config: Pick<Config, 'mongoUri' | 'mongoDb'>,
): Promise<Database> {
  const client = new MongoClient(config.mongoUri, {
    // Un solo usuario: un pool pequeño ahorra memoria en el servidor de 4 GB.
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  const db = client.db(config.mongoDb);
  return { client, db, collections: getCollections(db), close: () => client.close() };
}
