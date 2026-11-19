import { MongoClient, type Db } from 'mongodb';
import type { Config } from '../config';
import { syncCatalog } from '../modules/expenses/catalog-sync';
import { ensureIndexes } from './indexes';
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
  ProductDoc,
  RuleDoc,
  SessionDoc,
  StockCategoryDoc,
  TicketDoc,
  TransactionDoc,
  UserDoc,
} from './documents';

/** Names of the data collections a user may have; `prefix` is put in front of each one. */
export function getCollections(db: Db, prefix = '') {
  const data = <T extends object>(name: string) => db.collection<T>(`${prefix}${name}`);
  return {
    lists: data<ListDoc>('lists'),
    items: data<ItemDoc>('items'),
    events: data<EventDoc>('events'),
    dailyNotes: data<DailyNoteDoc>('daily_notes'),
    noteCards: data<NoteCardDoc>('note_cards'),
    noteGroups: data<NoteGroupDoc>('note_groups'),
    accounts: data<AccountDoc>('accounts'),
    transactions: data<TransactionDoc>('transactions'),
    categories: data<CategoryDoc>('categories'),
    rules: data<RuleDoc>('categorization_rules'),
    importBatches: data<ImportBatchDoc>('import_batches'),
    products: data<ProductDoc>('products'),
    stockCategories: data<StockCategoryDoc>('stock_categories'),
    tickets: data<TicketDoc>('tickets'),
    users: db.collection<UserDoc>('users'),
    sessions: db.collection<SessionDoc>('sessions'),
    credentials: db.collection<CredentialDoc>('credentials'),
  };
}

export type Collections = ReturnType<typeof getCollections>;

export interface Database {
  client: MongoClient;
  db: Db;
  /** The main database: the users and sessions, and the data of the first user. */
  collections: Collections;
  /**
   * The collections holding one user's data: `dataPrefix` is the one saved on the user (missing =
   * the unprefixed ones of the first user). A prefix seen for the first time gets its indexes and
   * the default catalog.
   */
  forUser(dataPrefix?: string): Promise<Collections>;
  close(): Promise<void>;
}

/** What a data prefix may look like: it goes straight into collection names, so it is checked. */
export const DATA_PREFIX = /^[a-z][a-z0-9]{0,23}_$/;

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
  const collections = getCollections(db);
  const opened = new Map<string, Promise<Collections>>();

  async function open(prefix: string): Promise<Collections> {
    const own = getCollections(db, prefix);
    await ensureIndexes(own);
    await syncCatalog(own);
    return own;
  }

  return {
    client,
    db,
    collections,
    forUser: (dataPrefix) => {
      if (dataPrefix === undefined) return Promise.resolve(collections);
      if (!DATA_PREFIX.test(dataPrefix)) throw new Error(`Invalid data prefix: ${dataPrefix}`);
      let ready = opened.get(dataPrefix);
      if (!ready) {
        ready = open(dataPrefix);
        // A failed attempt is not kept: the next request tries again.
        ready.catch(() => opened.delete(dataPrefix));
        opened.set(dataPrefix, ready);
      }
      return ready;
    },
    close: () => client.close(),
  };
}
