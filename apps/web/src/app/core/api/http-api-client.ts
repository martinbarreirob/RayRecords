import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
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
import { map, type Observable } from 'rxjs';
import { ApiClient, type ItemFilters } from './api-client';

/**
 * Implementation against the real API. Types come from `@rayrecords/shared`; the server validates
 * with the same schemas, so the client does not need to load Zod.
 */
@Injectable()
export class HttpApiClient extends ApiClient {
  private readonly http = inject(HttpClient);

  override login(input: LoginInput): Observable<User> {
    return this.http.post<User>('/api/auth/login', input);
  }

  override logout(): Observable<void> {
    return this.http.post<null>('/api/auth/logout', {}).pipe(map(() => undefined));
  }

  override me(): Observable<User> {
    return this.http.get<User>('/api/auth/me');
  }

  override lists(): Observable<List[]> {
    return this.http.get<List[]>('/api/lists');
  }

  override createList(input: CreateList): Observable<List> {
    return this.http.post<List>('/api/lists', input);
  }

  override updateList(id: string, input: UpdateList): Observable<List> {
    return this.http.patch<List>(`/api/lists/${id}`, input);
  }

  override items(listId: string, filters: ItemFilters = {}): Observable<Item[]> {
    let params = new HttpParams();
    if (filters.tag) params = params.set('tag', filters.tag);
    if (filters.q) params = params.set('q', filters.q);
    if (filters.done !== undefined) params = params.set('done', String(filters.done));
    return this.http.get<Item[]>(`/api/lists/${listId}/items`, { params });
  }

  override createItem(input: CreateItem): Observable<Item> {
    return this.http.post<Item>('/api/items', input);
  }

  override updateItem(id: string, input: UpdateItem): Observable<Item> {
    return this.http.patch<Item>(`/api/items/${id}`, input);
  }

  override moveItem(id: string, input: MoveItem): Observable<Item> {
    return this.http.post<Item>(`/api/items/${id}/move`, input);
  }

  override deleteItem(id: string): Observable<void> {
    return this.http.delete<null>(`/api/items/${id}`).pipe(map(() => undefined));
  }

  override noteBoard(): Observable<NoteBoard> {
    return this.http.get<NoteBoard>('/api/note-cards');
  }

  override doneNoteCards(): Observable<NoteCard[]> {
    return this.http.get<NoteCard[]>('/api/note-cards/done');
  }

  override createNoteCard(input: CreateNoteCard): Observable<NoteCard> {
    return this.http.post<NoteCard>('/api/note-cards', input);
  }

  override updateNoteCard(id: string, input: UpdateNoteCard): Observable<NoteCard> {
    return this.http.patch<NoteCard>(`/api/note-cards/${id}`, input);
  }

  override moveNoteCards(input: MoveNoteCards): Observable<NoteCard[]> {
    return this.http.patch<NoteCard[]>('/api/note-cards', input);
  }

  override deleteNoteCard(id: string): Observable<void> {
    return this.http.delete<null>(`/api/note-cards/${id}`).pipe(map(() => undefined));
  }

  override createNoteGroup(input: CreateNoteGroup): Observable<NoteGroup> {
    return this.http.post<NoteGroup>('/api/note-groups', input);
  }

  override updateNoteGroup(id: string, input: UpdateNoteGroup): Observable<NoteGroup> {
    return this.http.patch<NoteGroup>(`/api/note-groups/${id}`, input);
  }

  override deleteNoteGroup(id: string): Observable<NoteCard[]> {
    return this.http.delete<NoteCard[]>(`/api/note-groups/${id}`);
  }

  override capture(text: string): Observable<CaptureResponse> {
    return this.http.post<CaptureResponse>('/api/capture', { text });
  }

  override calendar(from: string, to: string): Observable<CalendarEntry[]> {
    return this.http.get<CalendarEntry[]>('/api/calendar', { params: { from, to } });
  }

  override accounts(): Observable<AccountSummary[]> {
    return this.http.get<AccountSummary[]>('/api/accounts');
  }

  override createAccount(input: CreateAccount): Observable<AccountSummary> {
    return this.http.post<AccountSummary>('/api/accounts', input);
  }

  override updateAccount(id: string, input: UpdateAccount): Observable<AccountSummary> {
    return this.http.patch<AccountSummary>(`/api/accounts/${id}`, input);
  }

  override categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories');
  }

  override createCategory(input: Category): Observable<Category> {
    return this.http.post<Category>('/api/categories', input);
  }

  override deleteCategory(key: string): Observable<void> {
    return this.http.delete<null>(`/api/categories/${key}`).pipe(map(() => undefined));
  }

  override rules(): Observable<CategorizationRule[]> {
    return this.http.get<CategorizationRule[]>('/api/rules');
  }

  override createRule(input: CreateRule): Observable<CategorizationRule> {
    return this.http.post<CategorizationRule>('/api/rules', input);
  }

  override updateRule(id: string, input: UpdateRule): Observable<CategorizationRule> {
    return this.http.patch<CategorizationRule>(`/api/rules/${id}`, input);
  }

  override deleteRule(id: string): Observable<void> {
    return this.http.delete<null>(`/api/rules/${id}`).pipe(map(() => undefined));
  }

  override applyRules(): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>('/api/rules/apply', {});
  }

  override transactions(query: Partial<TransactionQuery>): Observable<TransactionPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<TransactionPage>('/api/transactions', { params });
  }

  override setCategory(id: string, input: SetTransactionCategory): Observable<Transaction> {
    return this.http.patch<Transaction>(`/api/transactions/${id}/category`, input);
  }

  override importStatement(
    accountId: string,
    file: File,
    dryRun: boolean,
  ): Observable<ImportResult> {
    // The statement goes as a raw body (text/csv), not as multipart.
    return this.http.post<ImportResult>(`/api/accounts/${accountId}/imports`, file, {
      headers: { 'Content-Type': 'text/csv' },
      params: { fileName: file.name, dryRun: String(dryRun) },
    });
  }

  override imports(): Observable<ImportBatch[]> {
    return this.http.get<ImportBatch[]>('/api/imports');
  }

  override undoImport(id: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`/api/imports/${id}`);
  }

  override reviewQueue(limit = 20): Observable<ReviewQueue> {
    return this.http.get<ReviewQueue>('/api/review/queue', { params: { limit: String(limit) } });
  }

  override reviewPending(): Observable<{ pendingTransactions: number }> {
    return this.http.get<{ pendingTransactions: number }>('/api/review/pending');
  }

  override reviewApply(input: ReviewApply): Observable<ReviewApplyResult> {
    return this.http.post<ReviewApplyResult>('/api/review/apply', input);
  }

  override reviewUndo(input: ReviewUndo): Observable<{ reverted: number }> {
    return this.http.post<{ reverted: number }>('/api/review/undo', input);
  }

  override summary(params: {
    from: string;
    to: string;
    accountId?: string;
    type?: 'expense' | 'income';
  }): Observable<MonthlyCategoryTotal[]> {
    return this.http.get<MonthlyCategoryTotal[]>('/api/expenses/summary', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined),
      ) as Record<string, string>,
    });
  }
}
