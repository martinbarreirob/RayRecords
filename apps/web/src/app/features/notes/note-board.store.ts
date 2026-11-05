import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  NOTE_CARD_WIDTH,
  clampCoord,
  isVisible,
  stackOrder,
  type CreateNoteCard,
  type CreateNoteGroup,
  type MoveNoteCards,
  type NoteCard,
  type NoteGroup,
  type Point,
  type UpdateNoteCard,
  type UpdateNoteGroup,
} from '@rayrecords/shared';
import { Observable, tap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { mergeFinished } from './note-board.logic';

/** How many changes can be undone and how long the «Deshacer» notice lasts. */
const UNDO_DEPTH = 30;
const UNDO_NOTICE_MS = 8_000;
/** Maximum cards accepted by one batch move request. */
const MOVE_BATCH = 200;

interface UndoEntry {
  run: () => void;
}

/**
 * State of the notes canvas. Actions are optimistic: the screen shows the change at once and, if the
 * server rejects it, the canvas is reloaded so nothing false is shown.
 * Deleting, moving and grouping can be undone (`undo`); the visible notice only appears for destructive actions.
 */
@Injectable()
export class NoteBoardStore {
  private readonly api = inject(ApiClient);
  private readonly undoStack: UndoEntry[] = [];
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  /** Text of the «… · Deshacer» notice while it applies; `null` when it no longer does. */
  readonly undoNotice = signal<string | null>(null);

  readonly cards = signal<NoteCard[]>([]);
  readonly groups = signal<NoteGroup[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  /** Screen clock: as it advances, cards done more than 24 h ago disappear on their own. */
  readonly now = signal(Date.now());
  /** Done more than 24 h ago; `null` until the «Terminadas» view is requested. */
  readonly doneOld = signal<NoteCard[] | null>(null);

  readonly visibleCards = computed(() =>
    this.cards().filter((card) => isVisible(card.doneAt, this.now())),
  );
  /** Finished: done more than 24 h ago (those from the server and those that just expired here). */
  readonly finished = computed(() => mergeFinished(this.cards(), this.doneOld(), this.now()));
  /** Loose cards, back to front. */
  readonly looseCards = computed(() =>
    this.visibleCards()
      .filter((card) => card.groupId === null)
      .sort((a, b) => a.z - b.z),
  );
  readonly cardsByGroup = computed(() => {
    const map = new Map<string, NoteCard[]>();
    for (const card of this.visibleCards()) {
      if (card.groupId === null) continue;
      const list = map.get(card.groupId) ?? [];
      list.push(card);
      map.set(card.groupId, list);
    }
    // Inside a group they are stacked, in stack order.
    for (const [id, list] of map) map.set(id, stackOrder(list));
    return map;
  });
  /** For the mobile list: by position (top→bottom, left→right). */
  readonly byPosition = (cards: readonly NoteCard[]): NoteCard[] =>
    [...cards].sort((a, b) => a.y - b.y || a.x - b.x);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.noticeTimer));
  }

  tick(): void {
    this.now.set(Date.now());
  }

  // ---------- Undo ----------

  /** Stores how to revert a change. With `notice`, «Deshacer» is also offered for a few seconds. */
  record(run: () => void, notice?: string): void {
    this.undoStack.push({ run });
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    clearTimeout(this.noticeTimer);
    if (notice === undefined) {
      this.undoNotice.set(null);
      return;
    }
    this.undoNotice.set(notice);
    this.noticeTimer = setTimeout(() => this.undoNotice.set(null), UNDO_NOTICE_MS);
  }

  /** Reverts the last recorded change. Returns `false` if there was nothing to undo. */
  undo(): boolean {
    const entry = this.undoStack.pop();
    clearTimeout(this.noticeTimer);
    this.undoNotice.set(null);
    if (!entry) return false;
    entry.run();
    return true;
  }

  dismissUndoNotice(): void {
    clearTimeout(this.noticeTimer);
    this.undoNotice.set(null);
  }

  load(keepError = false): void {
    this.api.noteBoard().subscribe({
      next: (board) => {
        this.cards.set(board.cards);
        this.groups.set(board.groups);
        this.loading.set(false);
        if (!keepError) this.error.set('');
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No se pudieron cargar las notas'));
        this.loading.set(false);
      },
    });
  }

  /** Server rejected an optimistic change: warn, reload the real state, keep the notice. */
  private fail(error: unknown, fallback: string): void {
    this.error.set(apiErrorMessage(error, fallback));
    this.load(true);
  }

  private replaceCard(card: NoteCard): void {
    this.cards.update((list) => list.map((c) => (c.id === card.id ? card : c)));
  }

  createCard(input: CreateNoteCard): Observable<NoteCard> {
    return this.api
      .createNoteCard(input)
      .pipe(tap({ next: (card) => this.cards.update((list) => [...list, card]) }));
  }

  /** Applies the change locally and sends it; if it fails, reloads. */
  patchCard(id: string, patch: UpdateNoteCard): void {
    const now = new Date().toISOString();
    this.cards.update((list) =>
      list.map((card) => {
        if (card.id !== id) return card;
        const { done, ...fields } = patch;
        return {
          ...card,
          ...fields,
          ...(done === true && { doneAt: card.doneAt ?? now }),
          ...(done === false && { doneAt: null }),
        };
      }),
    );
    this.api.updateNoteCard(id, patch).subscribe({
      next: (card) => this.replaceCard(card),
      error: (error: unknown) => this.fail(error, 'No se pudo guardar la nota'),
    });
  }

  /**
   * Moves cards (and changes their group if given). With `undo` it records how to put them back;
   * `then` is called once the server has confirmed the change.
   */
  moveCards(input: MoveNoteCards, options: { undo?: boolean; then?: () => void } = {}): void {
    const byId = new Map(input.moves.map((m) => [m.id, m]));
    if (options.undo) {
      const before = this.cards()
        .filter((card) => byId.has(card.id))
        .map((card) => ({ id: card.id, x: card.x, y: card.y, groupId: card.groupId }));
      if (before.length > 0) this.record(() => this.moveCards({ moves: before }));
    }
    this.cards.update((list) =>
      list.map((card) => {
        const move = byId.get(card.id);
        if (!move) return card;
        return {
          ...card,
          x: move.x,
          y: move.y,
          ...(move.groupId !== undefined && { groupId: move.groupId }),
        };
      }),
    );
    this.api.moveNoteCards(input).subscribe({
      next: (cards) => {
        cards.forEach((card) => this.replaceCard(card));
        options.then?.();
      },
      error: (error: unknown) => this.fail(error, 'No se pudieron mover las notas'),
    });
  }

  /**
   * «Ordenar»: applies the new positions of loose cards and groups as ONE undoable operation (with a
   * notice). Only what really changes place is sent. Returns `false` if there was nothing to move.
   */
  arrange(placements: readonly { id: string; x: number; y: number }[]): boolean {
    const groups = new Map(this.groups().map((g) => [g.id, g]));
    const cards = new Map(this.cards().map((c) => [c.id, c]));
    const cardMoves: MoveNoteCards['moves'] = [];
    const cardsBefore: MoveNoteCards['moves'] = [];
    const groupMoves: { id: string; x: number; y: number }[] = [];
    const groupsBefore: { id: string; x: number; y: number }[] = [];

    for (const p of placements) {
      const group = groups.get(p.id);
      const card = cards.get(p.id);
      if (group && (group.x !== p.x || group.y !== p.y)) {
        groupMoves.push({ id: p.id, x: p.x, y: p.y });
        groupsBefore.push({ id: p.id, x: group.x, y: group.y });
      } else if (card && card.groupId === null && (card.x !== p.x || card.y !== p.y)) {
        cardMoves.push({ id: p.id, x: p.x, y: p.y, groupId: null });
        cardsBefore.push({ id: p.id, x: card.x, y: card.y, groupId: null });
      }
    }
    if (cardMoves.length === 0 && groupMoves.length === 0) return false;

    const apply = (cardList: MoveNoteCards['moves'], groupList: typeof groupMoves) => {
      // The server accepts up to 200 moves per request.
      for (let i = 0; i < cardList.length; i += MOVE_BATCH) {
        this.moveCards({ moves: cardList.slice(i, i + MOVE_BATCH) });
      }
      for (const m of groupList) this.patchGroup(m.id, { x: m.x, y: m.y });
    };
    apply(cardMoves, groupMoves);
    this.record(() => apply(cardsBefore, groupsBefore), 'Notas ordenadas');
    return true;
  }

  removeCard(id: string): void {
    this.removeCards([id]);
  }

  /**
   * Deletes several cards at once; they can be recovered with `undo` (recreated), except with
   * `undoable: false` (a new note left blank does not deserve a «Deshacer»).
   */
  removeCards(ids: readonly string[], options: { undoable?: boolean } = {}): void {
    const gone = this.cards().filter((card) => ids.includes(card.id));
    if (gone.length === 0) return;
    this.cards.update((list) => list.filter((card) => !ids.includes(card.id)));
    for (const card of gone) {
      this.api.deleteNoteCard(card.id).subscribe({
        error: (error: unknown) => this.fail(error, 'No se pudo borrar la nota'),
      });
    }
    if (options.undoable === false) return;
    this.record(
      () => gone.forEach((card) => this.restoreCard(card)),
      gone.length === 1 ? 'Nota borrada' : `${gone.length} notas borradas`,
    );
  }

  /** Recreates a deleted card (the server gives it a new id) with its width and state. */
  private restoreCard(card: NoteCard): void {
    const groupId = this.groups().some((g) => g.id === card.groupId) ? card.groupId : null;
    this.createCard({ text: card.text, x: card.x, y: card.y, groupId }).subscribe({
      next: (created) => {
        const patch: UpdateNoteCard = {
          ...(card.w !== NOTE_CARD_WIDTH && { w: card.w }),
          ...(card.doneAt !== null && { done: true }),
        };
        if (Object.keys(patch).length > 0) this.patchCard(created.id, patch);
      },
      error: (error: unknown) => this.fail(error, 'No se pudo recuperar la nota'),
    });
  }

  createGroup(input: CreateNoteGroup): Observable<NoteGroup> {
    return this.api
      .createNoteGroup(input)
      .pipe(tap({ next: (group) => this.groups.update((list) => [...list, group]) }));
  }

  patchGroup(id: string, patch: UpdateNoteGroup): void {
    this.groups.update((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    this.api.updateNoteGroup(id, patch).subscribe({
      next: (group) => this.groups.update((list) => list.map((g) => (g.id === id ? group : g))),
      error: (error: unknown) => this.fail(error, 'No se pudo guardar el grupo'),
    });
  }

  /**
   * Dissolves a group; its cards become loose where they were. Can be undone. Since cards in the group
   * are stacked, `positions` carries each one's real place on the canvas (if missing, it is computed
   * from their stored coordinates).
   */
  dissolveGroup(id: string, positions: ReadonlyMap<string, Point> = new Map()): void {
    const group = this.groups().find((g) => g.id === id);
    if (!group) return;
    const members = this.cards().filter((card) => card.groupId === id);
    this.groups.update((list) => list.filter((g) => g.id !== id));
    // Cards switch to canvas coordinates at once, without waiting for the server, so they do not vanish.
    this.cards.update((list) =>
      list.map((card) =>
        card.groupId === id
          ? { ...card, ...this.releasedAt(card, group, positions), groupId: null }
          : card,
      ),
    );
    this.api.deleteNoteGroup(id).subscribe({
      next: (released) => {
        // The server adds the stored coordinates; if the card was elsewhere, it is corrected.
        const fixes = released.flatMap((card) => {
          const at = this.releasedAt(card, { x: 0, y: 0 }, positions);
          return at.x === card.x && at.y === card.y ? [] : [{ id: card.id, ...at, groupId: null }];
        });
        released.forEach((card) => this.replaceCard(card));
        for (let i = 0; i < fixes.length; i += MOVE_BATCH) {
          this.moveCards({ moves: fixes.slice(i, i + MOVE_BATCH) });
        }
      },
      error: (error: unknown) => this.fail(error, 'No se pudo disolver el grupo'),
    });
    this.record(() => this.restoreGroup(group, members), 'Grupo disuelto');
  }

  private releasedAt(card: NoteCard, group: Point, positions: ReadonlyMap<string, Point>): Point {
    const at = positions.get(card.id) ?? { x: card.x + group.x, y: card.y + group.y };
    return { x: clampCoord(at.x), y: clampCoord(at.y) };
  }

  /** Recreates a dissolved group and gives it back its cards (the group id changes). */
  private restoreGroup(group: NoteGroup, members: readonly NoteCard[]): void {
    const { title, x, y, w, h } = group;
    this.createGroup({ title, x, y, w, h }).subscribe({
      next: (created) => {
        const moves = members
          .filter((card) => this.cards().some((c) => c.id === card.id))
          .map((card) => ({ id: card.id, x: card.x, y: card.y, groupId: created.id }));
        if (moves.length > 0) this.moveCards({ moves });
      },
      error: (error: unknown) => this.fail(error, 'No se pudo recuperar el grupo'),
    });
  }

  /**
   * Groups cards into an already created group. It records how to undo it: the cards go back to
   * where they were and, once the server confirms, the group (now empty) is deleted.
   */
  adoptCards(group: NoteGroup, moves: MoveNoteCards['moves']): void {
    const ids = new Set(moves.map((m) => m.id));
    const before = this.cards()
      .filter((card) => ids.has(card.id))
      .map((card) => ({ id: card.id, x: card.x, y: card.y, groupId: card.groupId }));
    this.moveCards({ moves });
    this.record(() => {
      this.groups.update((list) => list.filter((g) => g.id !== group.id));
      this.moveCards(
        { moves: before },
        {
          then: () =>
            this.api.deleteNoteGroup(group.id).subscribe({
              error: (error: unknown) => this.fail(error, 'No se pudo deshacer el grupo'),
            }),
        },
      );
    });
  }

  loadDoneOld(): void {
    this.api.doneNoteCards().subscribe({
      next: (cards) => this.doneOld.set(cards),
      error: (error: unknown) =>
        this.error.set(apiErrorMessage(error, 'No se pudieron cargar las terminadas')),
    });
  }

  /** Recovers a finished card: it returns to the canvas, not done. */
  recover(card: NoteCard): void {
    this.doneOld.update((list) => list?.filter((c) => c.id !== card.id) ?? null);
    const restored = { ...card, doneAt: null };
    this.cards.update((list) =>
      list.some((c) => c.id === card.id)
        ? list.map((c) => (c.id === card.id ? restored : c))
        : [...list, restored],
    );
    this.api.updateNoteCard(card.id, { done: false }).subscribe({
      next: (updated) => this.replaceCard(updated),
      error: (error: unknown) => this.fail(error, 'No se pudo recuperar la nota'),
    });
  }
}
