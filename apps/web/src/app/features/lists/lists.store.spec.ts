import { TestBed } from '@angular/core/testing';
import type { List, UpdateList } from '@rayrecords/shared';
import { Subject, of, throwError, type Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ListsStore } from './lists.store';

const id = (n: number) => n.toString(16).padStart(24, '0');
const stamp = '2026-11-04T09:00:00.000Z';

function list(n: number, name: string, order: number): List {
  return {
    id: id(n),
    name,
    slug: name.toLowerCase(),
    kind: 'free',
    fieldDefs: [],
    order,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('ListsStore: reorder', () => {
  let calls: { id: string; input: UpdateList }[];
  let respond: (listId: string, input: UpdateList) => Observable<List>;

  function setup(initial: List[]): ListsStore {
    calls = [];
    respond = (listId, input) => of({ ...initial.find((l) => l.id === listId)!, ...input } as List);
    const api = {
      lists: () => of(initial),
      updateList: (listId: string, input: UpdateList) => {
        calls.push({ id: listId, input });
        return respond(listId, input);
      },
    };
    TestBed.configureTestingModule({
      providers: [ListsStore, { provide: ApiClient, useValue: api }],
    });
    const store = TestBed.inject(ListsStore);
    store.load();
    return store;
  }

  const names = (store: ListsStore) => store.lists()!.map((l) => l.name);

  const films = list(1, 'Películas', 1000);
  const shows = list(2, 'Series', 2000);
  const shop = list(3, 'Compras', 3000);

  it('on load it leaves the lists sorted by order', () => {
    const store = setup([shop, films, shows]);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
  });

  it('changes the order at once and saves only the order of the moved list', () => {
    const store = setup([films, shows, shop]);
    const pending = new Subject<List>();
    respond = () => pending;

    let done = false;
    store.reorder(films.id, 2).subscribe({ complete: () => (done = true) });

    // Optimistic: already in place even though the API has not responded.
    expect(names(store)).toEqual(['Series', 'Compras', 'Películas']);
    expect(store.lists()!.at(-1)!.order).toBe(4000);
    expect(calls).toEqual([{ id: films.id, input: { order: 4000 } }]);
    expect(done).toBe(false);

    pending.next({ ...films, order: 4000 });
    pending.complete();
    expect(done).toBe(true);
    expect(names(store)).toEqual(['Series', 'Compras', 'Películas']);
  });

  it('if the API fails, it puts the list back and propagates the error', () => {
    const store = setup([films, shows, shop]);
    const failure = new Error('network down');
    respond = () => throwError(() => failure);

    let received: unknown;
    store.reorder(shop.id, 0).subscribe({ error: (e: unknown) => (received = e) });

    expect(received).toBe(failure);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
    expect(store.lists()!.map((l) => l.order)).toEqual([1000, 2000, 3000]);
  });

  it('with no gap it renumbers: several requests and, if one fails, all orders are restored', () => {
    const tight = [list(1, 'A', 1000), list(2, 'B', 2000), list(3, 'C', 2000), list(4, 'D', 5000)];
    const store = setup(tight);
    respond = (listId) =>
      listId === tight[3]!.id ? throwError(() => new Error('failed')) : of(tight[0]!);

    let failed = false;
    // D between B and C, which are adjacent (same order): no gap, so everything is renumbered.
    store.reorder(tight[3]!.id, 2).subscribe({ error: () => (failed = true) });

    expect(calls.map((c) => [c.id, c.input.order])).toEqual([
      [id(4), 3000],
      [id(3), 4000],
    ]);
    expect(failed).toBe(true);
    expect(store.lists()!.map((l) => [l.name, l.order])).toEqual([
      ['A', 1000],
      ['B', 2000],
      ['C', 2000],
      ['D', 5000],
    ]);
  });

  it('with no gap and on success, it leaves the orders renumbered', () => {
    const tight = [list(1, 'A', 1000), list(2, 'B', 2000), list(3, 'C', 2000), list(4, 'D', 5000)];
    const store = setup(tight);

    store.reorder(tight[3]!.id, 2).subscribe();

    expect(store.lists()!.map((l) => [l.name, l.order])).toEqual([
      ['A', 1000],
      ['B', 2000],
      ['D', 3000],
      ['C', 4000],
    ]);
  });

  it('the rollback only touches the lists of its own request', () => {
    const store = setup([films, shows, shop]);
    const first = new Subject<List>();
    respond = (listId) => (listId === films.id ? first : of(shop));

    store.reorder(films.id, 1).subscribe({ error: () => undefined }); // Series, Películas, Compras
    store.reorder(shop.id, 0).subscribe(); // Compras, Series, Películas
    expect(names(store)).toEqual(['Compras', 'Series', 'Películas']);

    first.error(new Error('failed'));
    // Películas goes back to its original order (1000); Compras keeps its own.
    expect(names(store)).toEqual(['Compras', 'Películas', 'Series']);
    expect(calls.map((c) => c.id)).toEqual([films.id, shop.id]);
  });

  it('does nothing and does not call the API if the list does not move or does not exist', () => {
    const store = setup([films, shows, shop]);
    let completed = 0;
    store.reorder(shows.id, 1).subscribe({ complete: () => completed++ });
    store.reorder(id(99), 0).subscribe({ complete: () => completed++ });
    expect(completed).toBe(2);
    expect(calls).toEqual([]);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
  });

  it('archived lists (outside the store) do not alter the order', () => {
    // The API only returns active ones; an archived one with an intermediate order does not take part.
    const store = setup([films, shop]);
    store.reorder(shop.id, 0).subscribe();
    expect(names(store)).toEqual(['Compras', 'Películas']);
    expect(calls).toEqual([{ id: shop.id, input: { order: 0 } }]);
  });
});
