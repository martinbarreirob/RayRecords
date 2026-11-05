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
      // Like the server: `done` becomes `doneAt`.
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

  it('separates loose cards from those in a group', () => {
    const store = setup();

    expect(store.looseCards().map((c) => c.id)).toEqual([id(1), id(3)]);
    expect(
      store
        .cardsByGroup()
        .get(group.id)
        ?.map((c) => c.id),
    ).toEqual([id(2)]);
  });

  it('moving a card shows at once, before the server responds', () => {
    const store = setup();
    api['moveNoteCards'] = () => new Observable<NoteCard[]>(); // never responds

    store.moveCards({ moves: [{ id: id(1), x: 300, y: 400, groupId: group.id }] });

    const moved = store.cards().find((c) => c.id === id(1));
    expect(moved).toMatchObject({ x: 300, y: 400, groupId: group.id });
  });

  it('marking as done sets doneAt and unmarking clears it', () => {
    const store = setup();

    store.patchCard(id(1), { done: true });
    expect(store.cards().find((c) => c.id === id(1))?.doneAt).not.toBeNull();

    store.patchCard(id(1), { done: false });
    expect(store.cards().find((c) => c.id === id(1))?.doneAt).toBeNull();
  });

  it('a card done more than 24 h ago stops showing when the clock advances', () => {
    const doneAt = new Date(Date.now() - DONE_VISIBLE_MS + 60_000).toISOString();
    board = { cards: [card(1, { doneAt })], groups: [] };
    const store = setup();
    expect(store.visibleCards()).toHaveLength(1);

    store.now.set(Date.now() + 2 * 60_000);

    expect(store.visibleCards()).toHaveLength(0);
    expect(store.cards()).toHaveLength(1); // still in memory: it is only hidden
  });

  it('if the server rejects a change, it reloads the canvas and warns', () => {
    const store = setup();
    api['updateNoteCard'] = () => throwError(() => new Error('fails'));
    board = { cards: [card(1), card(2, { groupId: group.id }), card(3)], groups: [group] };

    store.patchCard(id(1), { text: 'cambiado' });

    expect(store.error()).not.toBe('');
    expect(store.cards().find((c) => c.id === id(1))?.text).toBe('nota 1'); // back to the server value
  });

  it('deleting removes the card at once', () => {
    const store = setup();

    store.removeCard(id(3));

    expect(store.cards().map((c) => c.id)).toEqual([id(1), id(2)]);
  });

  it('sorts by position for the mobile list', () => {
    const store = setup();
    const sorted = store.byPosition([card(3), card(1), card(2, { y: 10, x: 0 })]);

    expect(sorted.map((c) => c.id)).toEqual([id(2), id(1), id(3)]);
  });

  describe('finished', () => {
    const longAgo = () => new Date(Date.now() - DONE_VISIBLE_MS - 3_600_000).toISOString();

    it('merges the server ones with those expiring on screen', () => {
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

    it('recovering one from the server returns it to the canvas, not done', () => {
      doneOld = [card(8, { doneAt: longAgo() })];
      const store = setup();
      store.loadDoneOld();

      store.recover(doneOld[0]!);

      expect(store.finished()).toHaveLength(0);
      expect(store.visibleCards().find((c) => c.id === id(8))?.doneAt).toBeNull();
    });

    it('recovering one that expired on screen does not duplicate it', () => {
      board = { cards: [card(1, { doneAt: longAgo() })], groups: [] };
      const store = setup();
      expect(store.visibleCards()).toHaveLength(0);

      store.recover(store.finished()[0]!);

      expect(store.cards().filter((c) => c.id === id(1))).toHaveLength(1);
      expect(store.visibleCards()).toHaveLength(1);
    });
  });

  describe('groups', () => {
    it('dissolving removes the group at once', () => {
      const store = setup();

      store.dissolveGroup(group.id);

      expect(store.groups()).toHaveLength(0);
    });

    it('renaming a group shows at once', () => {
      const store = setup();

      store.patchGroup(group.id, { title: 'Cocina' });

      expect(store.groups()[0]?.title).toBe('Cocina');
    });
  });
  describe('undo', () => {
    it('deleting offers the notice and undo recreates the card with its width', () => {
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

    it('deleting several at once is a single undo step', () => {
      const store = setup();

      store.removeCards([id(1), id(3)]);

      expect(store.undoNotice()).toBe('2 notas borradas');
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(false);
      expect(store.cards()).toHaveLength(3);
    });

    it('moving with undo stores the previous position, without a notice', () => {
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

    it('moving without undo leaves nothing to undo', () => {
      const store = setup();

      store.moveCards({ moves: [{ id: id(1), x: 300, y: 400 }] });

      expect(store.undo()).toBe(false);
    });

    it('dissolving a group leaves the cards loose at once and can be undone', () => {
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

    it('undoing a grouping returns the cards and deletes the group', () => {
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

    it('deleting without undoable leaves no notice and nothing to undo', () => {
      const store = setup();

      store.removeCards([id(1)], { undoable: false });

      expect(store.cards().map((c) => c.id)).toEqual([id(2), id(3)]);
      expect(store.undoNotice()).toBeNull();
      expect(store.undo()).toBe(false);
    });

    it('a new notice replaces the previous one', () => {
      const store = setup();

      store.removeCard(id(1));
      store.removeCard(id(3));

      expect(store.undoNotice()).toBe('Nota borrada');
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(false);
    });
  });

  describe('arrange', () => {
    it('applies all positions at once and offers a single «Deshacer»', () => {
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
      expect(batches).toHaveLength(1); // a single batch request for the cards
      expect(patches).toEqual([[group.id, { x: 320, y: 24 }]]);

      store.undo();

      expect(store.cards().find((c) => c.id === id(1))).toMatchObject({ x: 10, y: 10 });
      expect(store.cards().find((c) => c.id === id(3))).toMatchObject({ x: 30, y: 30 });
      expect(store.groups()[0]).toMatchObject({ x: 50, y: 50 });
      expect(store.undo()).toBe(false); // everything was undone at once
    });

    it('does not touch cards inside a group', () => {
      const store = setup();

      store.arrange([
        { id: id(2), x: 500, y: 500 },
        { id: id(1), x: 24, y: 24 },
      ]);

      expect(store.cards().find((c) => c.id === id(2))).toMatchObject({ x: 20, y: 20 });
    });

    it('if everything is already in place it does nothing and records no undo', () => {
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

    it('splits requests of more than 200 cards', () => {
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
