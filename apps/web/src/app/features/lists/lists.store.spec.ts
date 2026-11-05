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

describe('ListsStore: reordenar', () => {
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

  it('al cargar deja las listas ordenadas por order', () => {
    const store = setup([shop, films, shows]);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
  });

  it('cambia el orden al instante y guarda solo el order de la lista movida', () => {
    const store = setup([films, shows, shop]);
    const pending = new Subject<List>();
    respond = () => pending;

    let done = false;
    store.reorder(films.id, 2).subscribe({ complete: () => (done = true) });

    // Optimista: ya está en su sitio aunque la API no haya respondido.
    expect(names(store)).toEqual(['Series', 'Compras', 'Películas']);
    expect(store.lists()!.at(-1)!.order).toBe(4000);
    expect(calls).toEqual([{ id: films.id, input: { order: 4000 } }]);
    expect(done).toBe(false);

    pending.next({ ...films, order: 4000 });
    pending.complete();
    expect(done).toBe(true);
    expect(names(store)).toEqual(['Series', 'Compras', 'Películas']);
  });

  it('si la API falla, devuelve la lista a su sitio y propaga el error', () => {
    const store = setup([films, shows, shop]);
    const failure = new Error('sin red');
    respond = () => throwError(() => failure);

    let received: unknown;
    store.reorder(shop.id, 0).subscribe({ error: (e: unknown) => (received = e) });

    expect(received).toBe(failure);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
    expect(store.lists()!.map((l) => l.order)).toEqual([1000, 2000, 3000]);
  });

  it('sin hueco renumera: varias peticiones y, si una falla, vuelven todos los órdenes', () => {
    const tight = [list(1, 'A', 1000), list(2, 'B', 2000), list(3, 'C', 2000), list(4, 'D', 5000)];
    const store = setup(tight);
    respond = (listId) =>
      listId === tight[3]!.id ? throwError(() => new Error('falló')) : of(tight[0]!);

    let failed = false;
    // D entre B y C, que están pegadas (mismo orden): no hay hueco y se renumera todo.
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

  it('sin hueco y con éxito, deja los órdenes renumerados', () => {
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

  it('el rollback solo toca las listas de su petición', () => {
    const store = setup([films, shows, shop]);
    const first = new Subject<List>();
    respond = (listId) => (listId === films.id ? first : of(shop));

    store.reorder(films.id, 1).subscribe({ error: () => undefined }); // Series, Películas, Compras
    store.reorder(shop.id, 0).subscribe(); // Compras, Series, Películas
    expect(names(store)).toEqual(['Compras', 'Series', 'Películas']);

    first.error(new Error('falló'));
    // Películas vuelve a su orden original (1000); Compras conserva el suyo.
    expect(names(store)).toEqual(['Compras', 'Películas', 'Series']);
    expect(calls.map((c) => c.id)).toEqual([films.id, shop.id]);
  });

  it('no hace nada ni llama a la API si la lista no cambia de sitio o no existe', () => {
    const store = setup([films, shows, shop]);
    let completed = 0;
    store.reorder(shows.id, 1).subscribe({ complete: () => completed++ });
    store.reorder(id(99), 0).subscribe({ complete: () => completed++ });
    expect(completed).toBe(2);
    expect(calls).toEqual([]);
    expect(names(store)).toEqual(['Películas', 'Series', 'Compras']);
  });

  it('las listas archivadas (fuera del store) no alteran el orden', () => {
    // La API solo devuelve las activas; una archivada con order intermedio no interviene.
    const store = setup([films, shop]);
    store.reorder(shop.id, 0).subscribe();
    expect(names(store)).toEqual(['Compras', 'Películas']);
    expect(calls).toEqual([{ id: shop.id, input: { order: 0 } }]);
  });
});
