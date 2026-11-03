import type { ObjectId } from 'mongodb';
import type {
  Account,
  CategorizationRule,
  Category,
  DailyNote,
  Item,
  List,
  Transaction,
} from '@rayrecords/shared';

/**
 * Forma de los documentos en Mongo. Se derivan de los DTO de `@rayrecords/shared` cambiando solo lo
 * que difiere: `id` → `_id: ObjectId`, referencias como ObjectId y fechas como `Date`.
 * Las fechas "de calendario" (`dueDate`, `date` de nota) siguen siendo `YYYY-MM-DD`.
 */
type Timestamps = { createdAt: Date; updatedAt: Date };

export type ListDoc = Omit<List, 'id' | 'createdAt' | 'updatedAt'> & Timestamps & { _id: ObjectId };

export type ItemDoc = Omit<Item, 'id' | 'listId' | 'doneAt' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId; listId: ObjectId; doneAt?: Date };

export type DailyNoteDoc = Omit<DailyNote, 'id' | 'createdAt' | 'updatedAt'> &
  Timestamps & { _id: ObjectId };

export type AccountDoc = Omit<Account, 'id' | 'createdAt'> & { _id: ObjectId; createdAt: Date };

/** `date` es medianoche UTC (permite rangos y `$dateTrunc`); `month` está desnormalizado para agrupar. */
export type TransactionDoc = Omit<Transaction, 'id' | 'accountId' | 'date' | 'importBatchId'> & {
  _id: ObjectId;
  accountId: ObjectId;
  date: Date;
  descriptionNorm: string;
  /** sha256 de la transacción; con `accountId` forma el índice único de deduplicación. */
  hash: string;
  importBatchId?: ObjectId;
};

/** La clave de la categoría es su `_id`: es única sin necesitar un índice aparte. */
export type CategoryDoc = Omit<Category, 'key'> & { _id: string };

export type RuleDoc = Omit<CategorizationRule, 'id'> & { _id: ObjectId };

export interface ImportBatchDoc {
  _id: ObjectId;
  fileName: string;
  imported: number;
  skipped: number;
  createdAt: Date;
}
