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
 * Estado de las listas, compartido por la pantalla de listas y por la captura de la paleta
 * (que necesita los alias de cada lista para interpretar `peli:`, `compra:`…).
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  /** `null` mientras carga o si la API falló. */
  readonly lists = signal<List[] | null>(null);
  readonly failed = signal(false);
  /** Número de elementos por lista (id → total); se rellena con `loadCounts()`. */
  readonly counts = signal<Record<string, number>>({});

  /** Alias de captura de las listas; los de los presets mientras no haya datos. */
  readonly aliases = computed(
    () =>
      this.lists()?.flatMap((list) => (list.captureAlias ? [list.captureAlias] : [])) ??
      DEFAULT_LIST_ALIASES,
  );

  constructor() {
    // Carga inicial y recarga cada vez que algo cambia datos (p. ej. una captura).
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

  /** Cuenta los elementos de cada lista (una petición por lista: son pocas y es un solo usuario). */
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
   * Mueve la lista `id` a la posición `toIndex` (la que tendrá al terminar). Es optimista: el orden
   * cambia al suscribirse y, si la API falla, se devuelven a su sitio las listas tocadas y el error
   * llega al suscriptor. Solo se guarda el `order` que cambia (una lista; varias si hay que renumerar).
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

  /** Aplica órdenes sueltos y reordena. Solo toca esas listas, así otras operaciones en curso no se pisan. */
  private setOrders(orders: readonly { id: string; order: number }[]): void {
    const byId = new Map(orders.map((o) => [o.id, o.order]));
    this.lists.update(
      (lists) =>
        lists &&
        sortByOrder(lists.map((l) => (byId.has(l.id) ? { ...l, order: byId.get(l.id)! } : l))),
    );
  }
}
