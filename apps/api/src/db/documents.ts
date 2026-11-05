import type { ObjectId } from 'mongodb';
import type {
  Account,
  CalendarEvent,
  CategorizationRule,
  Category,
  DailyNote,
  Item,
  List,
  NoteCard,
  NoteGroup,
  Transaction,
} from '@rayrecords/shared';

/**
 * Document shapes in Mongo. They derive from the `@rayrecords/shared` DTOs and change only what
 * differs: `id` becomes `_id: ObjectId`, references are ObjectIds and timestamps are `Date`.
 * Calendar dates (`dueDate`, a note's `date`) stay as `YYYY-MM-DD` strings.
 */
type Timestamps = { createdAt: Date; updatedAt: Date };

export type ListDoc = Omit<List, 'id' | 'createdAt' | 'updatedAt'> & Timestamps & { _id: ObjectId };

export type ItemDoc = Omit<Item, 'id' | 'listId' | 'doneAt' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId; listId: ObjectId; doneAt?: Date };

export type EventDoc = Omit<CalendarEvent, 'id' | 'doneAt' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId; doneAt?: Date };

export type DailyNoteDoc = Omit<DailyNote, 'id' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId };

/** `groupId` and `doneAt` are always stored (as `null`) so they can be filtered with an index. */
export type NoteCardDoc = Omit<NoteCard, 'id' | 'groupId' | 'doneAt' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId; groupId: ObjectId | null; doneAt: Date | null };

export type NoteGroupDoc = Omit<NoteGroup, 'id' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId };

export type AccountDoc = Omit<Account, 'id' | 'createdAt'> & { _id: ObjectId; createdAt: Date };

/** `date` is UTC midnight (works with ranges and `$dateTrunc`); `month` is denormalized for grouping. */
export type TransactionDoc = Omit<Transaction, 'id' | 'accountId' | 'date' | 'importBatchId'> & {
  _id: ObjectId;
  accountId: ObjectId;
  date: Date;
  descriptionNorm: string;
  /** Merchant key (see `merchantKey`); `null` when there is none. Missing on pre-backfill data. */
  merchantKey?: string | null;
  /** sha256 of the transaction; with `accountId` it forms the unique dedup index. */
  hash: string;
  importBatchId?: ObjectId;
};

/** The category key is its `_id`, so it is unique without a separate index. */
export type CategoryDoc = Omit<Category, 'key'> & { _id: string };

export type RuleDoc = Omit<CategorizationRule, 'id'> & { _id: ObjectId };

export interface ImportBatchDoc {
  _id: ObjectId;
  accountId?: ObjectId;
  fileName: string;
  imported: number;
  skipped: number;
  createdAt: Date;
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

/** `_id` is the sha256 of the cookie token: the raw token is never stored. */
export interface SessionDoc {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  /** TTL index: Mongo deletes the session once this date has passed. */
  expiresAt: Date;
  userAgent?: string;
}

/** Passkeys (WebAuthn). Collection reserved for later; not used yet. */
export interface CredentialDoc {
  _id: ObjectId;
  userId: ObjectId;
  credentialId: string;
  publicKey: string;
  counter: number;
  createdAt: Date;
}
