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

/** Filtros de la lista de elementos. */
export interface ItemFilters {
  tag?: string;
  q?: string;
  done?: boolean;
}

/**
 * Contrato entre la UI y los datos. Las pantallas dependen de esta clase abstracta, nunca de
 * HttpClient: así se puede sustituir la implementación (p. ej. un adaptador en memoria para una
 * demo pública sin backend) sin tocar ninguna pantalla.
 */
export abstract class ApiClient {
  abstract login(input: LoginInput): Observable<User>;
  abstract logout(): Observable<void>;
  /** Usuario de la sesión actual; falla con 401 si no hay sesión. */
  abstract me(): Observable<User>;

  abstract lists(): Observable<List[]>;
  abstract createList(input: CreateList): Observable<List>;
  abstract updateList(id: string, input: UpdateList): Observable<List>;

  abstract items(listId: string, filters?: ItemFilters): Observable<Item[]>;
  abstract createItem(input: CreateItem): Observable<Item>;
  abstract updateItem(id: string, input: UpdateItem): Observable<Item>;
  abstract moveItem(id: string, input: MoveItem): Observable<Item>;
  abstract deleteItem(id: string): Observable<void>;

  /** Lienzo de notas: tarjetas y grupos (sin las hechas hace más de 24 h). */
  abstract noteBoard(): Observable<NoteBoard>;
  /** Hechas hace más de 24 h, ocultas del lienzo. */
  abstract doneNoteCards(): Observable<NoteCard[]>;
  /** Sin `x`/`y` el servidor elige el primer hueco libre. */
  abstract createNoteCard(input: CreateNoteCard): Observable<NoteCard>;
  abstract updateNoteCard(id: string, input: UpdateNoteCard): Observable<NoteCard>;
  abstract moveNoteCards(input: MoveNoteCards): Observable<NoteCard[]>;
  abstract deleteNoteCard(id: string): Observable<void>;
  abstract createNoteGroup(input: CreateNoteGroup): Observable<NoteGroup>;
  abstract updateNoteGroup(id: string, input: UpdateNoteGroup): Observable<NoteGroup>;
  /** Disuelve el grupo: devuelve sus tarjetas ya sueltas. */
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
  /** Reaplica las reglas a los movimientos sin categoría; devuelve cuántos cambiaron. */
  abstract applyRules(): Observable<{ updated: number }>;

  abstract transactions(query: Partial<TransactionQuery>): Observable<TransactionPage>;
  abstract setCategory(id: string, input: SetTransactionCategory): Observable<Transaction>;

  /** Sube un extracto CSV; con `dryRun` solo devuelve la vista previa. */
  abstract importStatement(
    accountId: string,
    file: File,
    dryRun: boolean,
  ): Observable<ImportResult>;
  abstract imports(): Observable<ImportBatch[]>;
  abstract undoImport(id: string): Observable<{ deleted: number }>;

  /** Cola de revisión: movimientos sin categoría agrupados por comercio, de más a menos importe. */
  abstract reviewQueue(limit?: number): Observable<ReviewQueue>;
  /** Solo cuántos movimientos hay sin categoría (para el contador de la pestaña). */
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
