import { TestBed } from '@angular/core/testing';
import { DONE_VISIBLE_MS, type NoteBoard, type NoteCard, type NoteGroup } from '@rayrecords/shared';
import { Observable, of, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { NoteBoardStore } from './note-board.store';

const id = (n: number) => n.toString(16).padStart(24, '0');
const stamp = '2026-11-04T09:00:00.000Z';

function card(n: number, extra: Partial<NoteCard> = {}): NoteCard {
  return {
    id: id(n),
    text: `nota ${n}`,
    x: 10 * n,
    y: 10 * n,
    w: 280,
    z: n,
    groupId: null,
    doneAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  };
}

const group: NoteGroup = {
  id: id(900),
  title: 'Reforma',
  x: 50,
  y: 50,
  w: 420,
  h: 300,
  createdAt: stamp,
  updatedAt: stamp,
};

describe('NoteBoardStore', () => {
  let api: Record<string, unknown>;
  let board: NoteBoard;
  let doneOld: NoteCard[];

  function setup(): NoteBoardStore {
    api = {
      noteBoard: () => of(board),
      // Como el servidor: `done` se traduce a `doneAt`.
      updateNoteCard: (cardId: string, patch: Partial<NoteCard> & { done?: boolean }) => {
        const { done, ...fields } = patch;
        return of({
          ...board.cards.find((c) => c.id === cardId)!,
          ...fields,
          ...(done !== undefined && { doneAt: done ? new Date().toISOString() : null }),
        });
      },
      deleteNoteCard: () => of(undefined),
      moveNoteCards: () => of([]),
      doneNoteCards: () => of(doneOld),
      deleteNoteGroup: () => of([]),
      updateNoteGroup: (_id: string, patch: Partial<NoteGroup>) => of({ ...group, ...patch }),
      createNoteCard: (input: Partial<NoteCard>) => of(card(77, input)),
    };
    TestBed.configureTestingModule({
      providers: [NoteBoardStore, { provide: ApiClient, useValue: api }],
    });
    const store = TestBed.inject(NoteBoardStore);
    store.load();
    return store;
  }

  beforeEach(() => {
    doneOld = [];
    board = { cards: [card(1), card(2, { groupId: group.id }), card(3)], groups: [group] };
  });

  it('separa las tarjetas sueltas de las de un grupo', () => {
    const store = setup();

    expect(store.looseCards().map((c) => c.id)).toEqual([id(1), id(3)]);
    expect(
      store
        .cardsByGroup()
        .get(group.id)
        ?.map((c) => c.id),
    ).toEqual([id(2)]);
  });

  it('mover una tarjeta se refleja al instante, antes de la respuesta del servidor', () => {
    const store = setup();
    api['moveNoteCards'] = () => new Observable<NoteCard[]>(); // no responde nunca

    store.moveCards({ moves: [{ id: id(1), x: 300, y: 400, groupId: group.id }] });

    const moved = store.cards().find((c) => c.id === id(1));
    expect(moved).toMatchObject({ x: 300, y: 400, groupId: group.id });
  });

  it('marcar como hecha fija doneAt y desmarcar lo borra', () => {
    const store = setup();

    store.patchCard(id(1), { done: true });
    expect(store.cards().find((c) => c.id === id(1))?.doneAt).not.toBeNull();

    store.patchCard(id(1), { done: false });
    expect(store.cards().find((c) => c.id === id(1))?.doneAt).toBeNull();
  });

  it('una tarjeta hecha hace más de 24 h deja de verse al avanzar el reloj', () => {
    const doneAt = new Date(Date.now() - DONE_VISIBLE_MS + 60_000).toISOString();
    board = { cards: [card(1, { doneAt })], groups: [] };
    const store = setup();
    expect(store.visibleCards()).toHaveLength(1);

    store.now.set(Date.now() + 2 * 60_000);

    expect(store.visibleCards()).toHaveLength(0);
    expect(store.cards()).toHaveLength(1); // sigue en memoria: solo se oculta
  });

  it('si el servidor rechaza un cambio, recarga el lienzo y avisa', () => {
    const store = setup();
    api['updateNoteCard'] = () => throwError(() => new Error('falla'));
    board = { cards: [card(1), card(2, { groupId: group.id }), card(3)], groups: [group] };

    store.patchCard(id(1), { text: 'cambiado' });

    expect(store.error()).not.toBe('');
    expect(store.cards().find((c) => c.id === id(1))?.text).toBe('nota 1'); // vuelve al valor del servidor
  });

  it('borrar quita la tarjeta al momento', () => {
    const store = setup();

    store.removeCard(id(3));

    expect(store.cards().map((c) => c.id)).toEqual([id(1), id(2)]);
  });

  it('ordena por posición para la lista del móvil', () => {
    const store = setup();
    const sorted = store.byPosition([card(3), card(1), card(2, { y: 10, x: 0 })]);

    expect(sorted.map((c) => c.id)).toEqual([id(2), id(1), id(3)]);
  });

  describe('terminadas', () => {
    const longAgo = () => new Date(Date.now() - DONE_VISIBLE_MS - 3_600_000).toISOString();

    it('une las del servidor con las que caducan en pantalla', () => {
      const expiring = new Date(Date.now() - DONE_VISIBLE_MS + 60_000).toISOString();
      doneOld = [card(8, { doneAt: longAgo() })];
      board = { cards: [card(1, { doneAt: expiring }), card(3)], groups: [] };
      const store = setup();
      store.loadDoneOld();
      expect(store.finished().map((c) => c.id)).toEqual([id(8)]);

      store.now.set(Date.now() + 2 * 60_000);

      expect(
        store
          .finished()
          .map((c) => c.id)
          .sort(),
      ).toEqual([id(1), id(8)]);
    });

    it('recuperar una del servidor la devuelve al lienzo sin hacer', () => {
      doneOld = [card(8, { doneAt: longAgo() })];
      const store = setup();
      store.loadDoneOld();

      store.recover(doneOld[0]!);

      expect(store.finished()).toHaveLength(0);
      expect(store.visibleCards().find((c) => c.id === id(8))?.doneAt).toBeNull();
    });

    it('recuperar una que caducó en pantalla no la duplica', () => {
      board = { cards: [card(1, { doneAt: longAgo() })], groups: [] };
      const store = setup();
      expect(store.visibleCards()).toHaveLength(0);

      store.recover(store.finished()[0]!);

      expect(store.cards().filter((c) => c.id === id(1))).toHaveLength(1);
      expect(store.visibleCards()).toHaveLength(1);
    });
  });

  describe('grupos', () => {
    it('disolver quita el grupo al momento', () => {
      const store = setup();

      store.dissolveGroup(group.id);

      expect(store.groups()).toHaveLength(0);
    });

    it('renombrar un grupo se refleja al instante', () => {
      const store = setup();

      store.patchGroup(group.id, { title: 'Cocina' });

      expect(store.groups()[0]?.title).toBe('Cocina');
    });
  });
  describe('deshacer', () => {
    it('borrar ofrece el aviso y deshacer vuelve a crear la tarjeta con su ancho', () => {
      const store = setup();
      const created: unknown[] = [];
      api['createNoteCard'] = (input: Partial<NoteCard>) => {
        created.push(input);
        return of(card(77, input));
      };
      board = { cards: [card(1, { w: 400 }), card(3)], groups: [] };
      store.load();

      store.removeCard(id(1));
      expect(store.undoNotice()).toBe('Nota borrada');
      expect(store.cards().map((c) => c.id)).toEqual([id(3)]);

      expect(store.undo()).toBe(true);

      expect(created).toEqual([{ text: 'nota 1', x: 10, y: 10, groupId: null }]);
      expect(store.cards().map((c) => c.id)).toEqual([id(3), id(77)]);
      expect(store.cards().find((c) => c.id === id(77))?.w).toBe(400);
      expect(store.undoNotice()).toBeNull();
    });

    it('borrar varias a la vez es un solo paso de deshacer', () => {
      const store = setup();

      store.removeCards([id(1), id(3)]);

      expect(store.undoNotice()).toBe('2 notas borradas');
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(false);
      expect(store.cards()).toHaveLength(3);
    });

    it('mover con undo guarda la posición anterior, sin avisar', () => {
      const store = setup();

      store.moveCards(
        { moves: [{ id: id(1), x: 300, y: 400, groupId: group.id }] },
        { undo: true },
      );
      expect(store.undoNotice()).toBeNull();
      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({ x: 300, y: 400 });

      store.undo();

      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({
        x: 10,
        y: 10,
        groupId: null,
      });
    });

    it('mover sin undo no deja nada que deshacer', () => {
      const store = setup();

      store.moveCards({ moves: [{ id: id(1), x: 300, y: 400 }] });

      expect(store.undo()).toBe(false);
    });

    it('disolver un grupo deja las tarjetas sueltas al momento y se puede deshacer', () => {
      const store = setup();
      api['createNoteGroup'] = (input: Partial<NoteGroup>) =>
        of({ ...group, ...input, id: id(901) });

      store.dissolveGroup(group.id);
      const released = store.cards().find((c) => c.id === id(2));
      expect(released).toMatchObject({ groupId: null, x: 20 + group.x, y: 20 + group.y });
      expect(store.undoNotice()).toBe('Grupo disuelto');

      store.undo();

      expect(store.groups().map((g) => g.id)).toEqual([id(901)]);
      expect(store.cards().find((c) => c.id === id(2))).toMatchObject({
        groupId: id(901),
        x: 20,
        y: 20,
      });
    });

    it('deshacer un agrupado devuelve las tarjetas y borra el grupo', () => {
      const store = setup();
      const deleted: string[] = [];
      api['deleteNoteGroup'] = (groupId: string) => {
        deleted.push(groupId);
        return of([]);
      };

      store.adoptCards(group, [{ id: id(1), x: 5, y: 6, groupId: group.id }]);
      expect(store.cards().find((c) => c.id === id(1))?.groupId).toBe(group.id);

      store.undo();

      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({
        groupId: null,
        x: 10,
        y: 10,
      });
      expect(deleted).toEqual([group.id]);
    });

    it('borrar sin undoable no deja aviso ni nada que deshacer', () => {
      const store = setup();

      store.removeCards([id(1)], { undoable: false });

      expect(store.cards().map((c) => c.id)).toEqual([id(2), id(3)]);
      expect(store.undoNotice()).toBeNull();
      expect(store.undo()).toBe(false);
    });

    it('un aviso nuevo sustituye al anterior', () => {
      const store = setup();

      store.removeCard(id(1));
      store.removeCard(id(3));

      expect(store.undoNotice()).toBe('Nota borrada');
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(false);
    });
  });

  describe('arrange (ordenar)', () => {
    it('aplica todas las posiciones a la vez y ofrece un solo «Deshacer»', () => {
      const store = setup();
      const batches: unknown[] = [];
      api['moveNoteCards'] = (input: unknown) => {
        batches.push(input);
        return of([]);
      };
      const patches: unknown[] = [];
      api['updateNoteGroup'] = (gid: string, patch: Partial<NoteGroup>) => {
        patches.push([gid, patch]);
        return of({ ...group, ...patch });
      };

      const done = store.arrange([
        { id: id(1), x: 24, y: 24 },
        { id: group.id, x: 320, y: 24 },
        { id: id(3), x: 756, y: 24 },
      ]);

      expect(done).toBe(true);
      expect(store.undoNotice()).toBe('Notas ordenadas');
      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({ x: 24, y: 24 });
      expect(store.groups()[0]).toMatchObject({ x: 320, y: 24 });
      expect(batches).toHaveLength(1); // una sola petición por lotes para las tarjetas
      expect(patches).toEqual([[group.id, { x: 320, y: 24 }]]);

      store.undo();

      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({ x: 10, y: 10 });
      expect(store.cards().find((c) => c.id === id(3))).toMatchObject({ x: 30, y: 30 });
      expect(store.groups()[0]).toMatchObject({ x: 50, y: 50 });
      expect(store.undo()).toBe(false); // todo se deshizo de una vez
    });

    it('no toca las tarjetas que están dentro de un grupo', () => {
      const store = setup();

      store.arrange([
        { id: id(2), x: 500, y: 500 },
        { id: id(1), x: 24, y: 24 },
      ]);

      expect(store.cards().find((c) => c.id === id(2))).toMatchObject({ x: 20, y: 20 });
    });

    it('si ya está todo en su sitio no hace nada y no registra deshacer', () => {
      const store = setup();

      const done = store.arrange([
        { id: id(1), x: 10, y: 10 },
        { id: id(3), x: 30, y: 30 },
        { id: group.id, x: 50, y: 50 },
      ]);

      expect(done).toBe(false);
      expect(store.undoNotice()).toBeNull();
      expect(store.undo()).toBe(false);
    });

    it('trocea las peticiones de más de 200 tarjetas', () => {
      board = {
        cards: Array.from({ length: 450 }, (_, i) => card(i + 1, { x: 0, y: 0 })),
        groups: [],
      };
      const store = setup();
      const sizes: number[] = [];
      api['moveNoteCards'] = (input: { moves: unknown[] }) => {
        sizes.push(input.moves.length);
        return of([]);
      };

      store.arrange(board.cards.map((c, i) => ({ id: c.id, x: 24 + i, y: 24 })));

      expect(sizes).toEqual([200, 200, 50]);
    });
  });
});
