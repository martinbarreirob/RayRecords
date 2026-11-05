import type {
  AccountSummary,
  CalendarEntry,
  CaptureResponse,
  Category,
  ReviewApply,
  ReviewApplyResult,
  ReviewQueue,
  ReviewUndo,
  CategorizationRule,
  CreateAccount,
  CreateItem,
  CreateList,
  CreateRule,
  ImportBatch,
  ImportResult,
  Item,
  List,
  LoginInput,
  MonthlyCategoryTotal,
  CreateNoteCard,
  CreateNoteGroup,
  MoveItem,
  MoveNoteCards,
  NoteBoard,
  NoteCard,
  NoteGroup,
  SetTransactionCategory,
  Transaction,
  TransactionPage,
  TransactionQuery,
  UpdateAccount,
  UpdateItem,
  UpdateList,
  UpdateNoteCard,
  UpdateNoteGroup,
  UpdateRule,
  User,
} from '@rayrecords/shared';
import type { Observable } from 'rxjs';

/** Filters for the item list. */
export interface ItemFilters {
  tag?: string;
  q?: string;
  done?: boolean;
}

/**
 * Contract between the UI and the data. Screens depend on this abstract class, never on
 * HttpClient, so the implementation can be swapped (for example an in-memory adapter for a
 * public demo without a backend) without touching any screen.
 */
export abstract class ApiClient {
  abstract login(input: LoginInput): Observable<User>;
  abstract logout(): Observable<void>;
  /** Current session user; fails with 401 when there is no session. */
  abstract me(): Observable<User>;

  abstract lists(): Observable<List[]>;
  abstract createList(input: CreateList): Observable<List>;
  abstract updateList(id: string, input: UpdateList): Observable<List>;

  abstract items(listId: string, filters?: ItemFilters): Observable<Item[]>;
  abstract createItem(input: CreateItem): Observable<Item>;
  abstract updateItem(id: string, input: UpdateItem): Observable<Item>;
  abstract moveItem(id: string, input: MoveItem): Observable<Item>;
  abstract deleteItem(id: string): Observable<void>;

  /** Notes canvas: cards and groups (without the ones done more than 24 h ago). */
  abstract noteBoard(): Observable<NoteBoard>;
  /** Done more than 24 h ago, hidden from the canvas. */
  abstract doneNoteCards(): Observable<NoteCard[]>;
  /** Without `x`/`y` the server picks the first free spot. */
  abstract createNoteCard(input: CreateNoteCard): Observable<NoteCard>;
  abstract updateNoteCard(id: string, input: UpdateNoteCard): Observable<NoteCard>;
  abstract moveNoteCards(input: MoveNoteCards): Observable<NoteCard[]>;
  abstract deleteNoteCard(id: string): Observable<void>;
  abstract createNoteGroup(input: CreateNoteGroup): Observable<NoteGroup>;
  abstract updateNoteGroup(id: string, input: UpdateNoteGroup): Observable<NoteGroup>;
  /** Dissolves the group and returns its cards, now loose. */
  abstract deleteNoteGroup(id: string): Observable<NoteCard[]>;

  abstract capture(text: string): Observable<CaptureResponse>;

  abstract calendar(from: string, to: string): Observable<CalendarEntry[]>;

  abstract accounts(): Observable<AccountSummary[]>;
  abstract createAccount(input: CreateAccount): Observable<AccountSummary>;
  abstract updateAccount(id: string, input: UpdateAccount): Observable<AccountSummary>;

  abstract categories(): Observable<Category[]>;
  abstract createCategory(input: Category): Observable<Category>;
  abstract deleteCategory(key: string): Observable<void>;

  abstract rules(): Observable<CategorizationRule[]>;
  abstract createRule(input: CreateRule): Observable<CategorizationRule>;
  abstract updateRule(id: string, input: UpdateRule): Observable<CategorizationRule>;
  abstract deleteRule(id: string): Observable<void>;
  /** Reapplies the rules to uncategorized movements; returns how many changed. */
  abstract applyRules(): Observable<{ updated: number }>;

  abstract transactions(query: Partial<TransactionQuery>): Observable<TransactionPage>;
  abstract setCategory(id: string, input: SetTransactionCategory): Observable<Transaction>;

  /** Uploads a CSV statement; with `dryRun` it only returns the preview. */
  abstract importStatement(
    accountId: string,
    file: File,
    dryRun: boolean,
  ): Observable<ImportResult>;
  abstract imports(): Observable<ImportBatch[]>;
  abstract undoImport(id: string): Observable<{ deleted: number }>;

  /** Review queue: uncategorized movements grouped by merchant, largest amount first. */
  abstract reviewQueue(limit?: number): Observable<ReviewQueue>;
  /** Only the number of uncategorized movements (for the tab counter). */
  abstract reviewPending(): Observable<{ pendingTransactions: number }>;
  abstract reviewApply(input: ReviewApply): Observable<ReviewApplyResult>;
  abstract reviewUndo(input: ReviewUndo): Observable<{ reverted: number }>;

  abstract summary(params: {
    from: string;
    to: string;
    accountId?: string;
    type?: 'expense' | 'income';
  }): Observable<MonthlyCategoryTotal[]>;
}
