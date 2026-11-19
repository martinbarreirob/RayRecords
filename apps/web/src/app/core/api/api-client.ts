import type {
  AccountSummary,
  CalendarEntry,
  CalendarEvent,
  CaptureResponse,
  CreateEvent,
  UpdateEvent,
  Category,
  CategoryUsage,
  CreateCategory,
  ReviewApply,
  ReviewApplyResult,
  ReviewQueue,
  ReviewUndo,
  CategorizationRule,
  CreateAccount,
  CreateItem,
  CreateList,
  CreateProduct,
  CreateRule,
  CreateStockCategory,
  CreateTicket,
  Dashboard,
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
  Product,
  ProductSales,
  SetTransactionCategory,
  StockCategory,
  Ticket,
  Transaction,
  TransactionPage,
  TransactionQuery,
  UpdateAccount,
  UpdateItem,
  UpdateList,
  UpdateNoteCard,
  UpdateNoteGroup,
  UpdateProduct,
  UpdateRule,
  UpdateCategory,
  UpdateStockCategory,
  UpdateUser,
  User,
} from '@rayrecords/shared';
import type { Observable } from 'rxjs';

/** Filters for the item list. */
export interface ItemFilters {
  tag?: string;
  q?: string;
  done?: boolean;
}

export interface TicketsQuery {
  limit?: number;
  from?: string;
  to?: string;
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
  /** Saves the user's own preferences (the theme) in the account. */
  abstract updateMe(input: UpdateUser): Observable<User>;

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

  /** Dated list items plus the calendar's own events. */
  abstract calendar(from: string, to: string): Observable<CalendarEntry[]>;
  /** Events live only in the calendar and need no list. */
  abstract createEvent(input: CreateEvent): Observable<CalendarEvent>;
  abstract updateEvent(id: string, input: UpdateEvent): Observable<CalendarEvent>;
  abstract deleteEvent(id: string): Observable<void>;

  abstract accounts(): Observable<AccountSummary[]>;
  abstract createAccount(input: CreateAccount): Observable<AccountSummary>;
  abstract updateAccount(id: string, input: UpdateAccount): Observable<AccountSummary>;

  abstract categories(): Observable<Category[]>;
  /** Without a `key` the server makes one from the name. */
  abstract createCategory(input: CreateCategory): Observable<Category>;
  /** Partial: the name, the icon or either color. */
  abstract updateCategory(key: string, input: UpdateCategory): Observable<Category>;
  /** Transactions per category key (categories with none are left out). */
  abstract categoryUsage(): Observable<CategoryUsage>;
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

  /** The whole stock, sorted by name. */
  abstract products(): Observable<Product[]>;
  abstract createProduct(input: CreateProduct): Observable<Product>;
  /** `null` in `sku` or `notes` clears the field. */
  abstract updateProduct(id: string, input: UpdateProduct): Observable<Product>;
  abstract deleteProduct(id: string): Observable<void>;

  abstract stockCategories(): Observable<StockCategory[]>;
  abstract createStockCategory(input: CreateStockCategory): Observable<StockCategory>;
  /** Partial: the name, the icon or either color. */
  abstract updateStockCategory(id: string, input: UpdateStockCategory): Observable<StockCategory>;
  /** Its products stay, without a category. */
  abstract deleteStockCategory(id: string): Observable<void>;

  /** Turns a cart into a ticket and takes the units out of the stock; 409 if there is not enough. */
  abstract createTicket(input: CreateTicket): Observable<Ticket>;
  /**
   * Newest first; the server caps `limit` at 200. `from` and `to` are days (`YYYY-MM-DD`, both
   * included) in the app's time zone.
   */
  abstract tickets(query?: TicketsQuery): Observable<Ticket[]>;
  /** Units sold per product over every ticket, best seller first. */
  abstract topProducts(): Observable<ProductSales[]>;

  /** The management dashboard for the last 7, 30 or 90 days. */
  abstract dashboard(days: number): Observable<Dashboard>;
}
