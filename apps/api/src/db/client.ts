import { MongoClient, type Db } from 'mongodb';
import type { Config } from '../config';
import type {
  AccountDoc,
  CategoryDoc,
  CredentialDoc,
  DailyNoteDoc,
  EventDoc,
  ImportBatchDoc,
  ItemDoc,
  ListDoc,
  NoteCardDoc,
  NoteGroupDoc,
  RuleDoc,
  SessionDoc,
  TransactionDoc,
  UserDoc,
} from './documents';

export function getCollections(db: Db) {
  return {
    lists: db.collection<ListDoc>('lists'),
    items: db.collection<ItemDoc>('items'),
    events: db.collection<EventDoc>('events'),
    dailyNotes: db.collection<DailyNoteDoc>('daily_notes'),
    noteCards: db.collection<NoteCardDoc>('note_cards'),
    noteGroups: db.collection<NoteGroupDoc>('note_groups'),
    accounts: db.collection<AccountDoc>('accounts'),
    transactions: db.collection<TransactionDoc>('transactions'),
    categories: db.collection<CategoryDoc>('categories'),
    rules: db.collection<RuleDoc>('categorization_rules'),
    importBatches: db.collection<ImportBatchDoc>('import_batches'),
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    credentials: db.collection<CredentialDoc>('credentials'),
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
    // Single user: a small pool saves memory on the 4 GB server.
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  const db = client.db(config.mongoDb);
  return { client, db, collections: getCollections(db), close: () => client.close() };
}
