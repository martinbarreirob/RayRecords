import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  DEFAULT_LIST_ALIASES,
  type CreateList,
  type List,
  type UpdateList,
} from '@rayrecords/shared';
import type { Observable } from 'rxjs';
import { EMPTY, catchError, defer, forkJoin, map, of, tap, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { RefreshBus } from '../../core/refresh';
import { planReorder, sortByOrder } from './lists-logic';

/**
 * State of the lists, shared by the lists screen and the palette capture
 * (which needs each list's aliases to interpret `peli:`, `compra:`…).
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  /** `null` while loading or if the API failed. */
  readonly lists = signal<List[] | null>(null);
  readonly failed = signal(false);
  /** Item count per list (id → total); filled by `loadCounts()`. */
  readonly counts = signal<Record<string, number>>({});

  /** Capture aliases of the lists; those of the presets while there is no data. */
  readonly aliases = computed(
    () =>
      this.lists()?.flatMap((list) => (list.captureAlias ? [list.captureAlias] : [])) ??
      DEFAULT_LIST_ALIASES,
  );

  constructor() {
    // Initial load and reload each time something changes data (e.g. a capture).
    effect(() => {
      this.bus.version();
      this.load();
    });
  }

  load(): void {
    this.failed.set(false);
    this.api.lists().subscribe({
      next: (lists) => this.lists.set(sortByOrder(lists)),
      error: () => this.failed.set(true),
    });
  }

  /** Counts the items of each list (one request per list: there are few and it is a single user). */
  loadCounts(): void {
    const lists = this.lists();
    if (!lists?.length) {
      this.counts.set({});
      return;
    }
    forkJoin(
      lists.map((list) =>
        this.api.items(list.id).pipe(
          map((items) => [list.id, items.length] as const),
          catchError(() => of([list.id, 0] as const)),
        ),
      ),
    ).subscribe((entries) => this.counts.set(Object.fromEntries(entries)));
  }

  create(input: CreateList): Observable<List> {
    return this.api
      .createList(input)
      .pipe(tap((list) => this.lists.update((lists) => [...(lists ?? []), list])));
  }

  update(list: List, input: UpdateList): Observable<List> {
    return this.api
      .updateList(list.id, input)
      .pipe(
        tap((saved) =>
          this.lists.update((lists) => lists?.map((l) => (l.id === saved.id ? saved : l)) ?? null),
        ),
      );
  }

  archive(list: List): Observable<List> {
    return this.api
      .updateList(list.id, { archived: true })
      .pipe(
        tap(() => this.lists.update((lists) => lists?.filter((l) => l.id !== list.id) ?? null)),
      );
  }

  /**
   * Moves list `id` to position `toIndex` (the one it will have at the end). It is optimistic: the order
   * changes on subscribe and, if the API fails, the touched lists are put back and the error reaches
   * the subscriber. Only the `order` that changes is saved (one list; several if renumbering).
   */
  reorder(id: string, toIndex: number): Observable<void> {
    return defer(() => {
      const current = this.lists();
      const plan = current ? planReorder(current, id, toIndex) : null;
      if (!current || !plan) return EMPTY;

      const previous = plan.patches.map((patch) => ({
        id: patch.id,
        order: current.find((l) => l.id === patch.id)!.order,
      }));
      this.setOrders(plan.patches);
      return forkJoin(plan.patches.map((p) => this.api.updateList(p.id, { order: p.order }))).pipe(
        map(() => undefined),
        catchError((error: unknown) => {
          this.setOrders(previous);
          return throwError(() => error);
        }),
      );
    });
  }

  /** Applies loose orders and re-sorts, touching only those lists. */
  private setOrders(orders: readonly { id: string; order: number }[]): void {
    const byId = new Map(orders.map((o) => [o.id, o.order]));
    this.lists.update(
      (lists) =>
        lists &&
        sortByOrder(lists.map((l) => (byId.has(l.id) ? { ...l, order: byId.get(l.id)! } : l))),
    );
  }
}
