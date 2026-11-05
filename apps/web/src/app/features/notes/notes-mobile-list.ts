import { Component, computed, inject, input, output } from '@angular/core';
import { formatDuration, remainingMs, type NoteCard } from '@rayrecords/shared';
import { NoteBoardStore } from './note-board.store';
import { NoteRow } from './note-row';

/**
 * Notes list for narrow screens (< 768 px): groups are collapsible and loose ones go below, all
 * sorted by their canvas position. Editing and actions are decided by the page; here it only
 * renders and notifies.
 */
@Component({
  selector: 'app-notes-mobile-list',
  imports: [NoteRow],
  styles: `
    .group {
      margin-bottom: var(--space-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      overflow: hidden;
    }

    summary {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--touch-target);
      padding: 0 14px;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:active {
      background: var(--surface);
    }

    summary::before {
      content: '▸';
      color: var(--muted);
      font-size: var(--text-xs);
      font-weight: 400;
    }

    .group[open] summary::before {
      content: '▾';
    }

    .count {
      color: var(--muted);
      font-size: var(--text-sm);
      font-weight: 400;
    }

    .none {
      padding: var(--space-3) 14px;
      border-top: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .eyebrow {
      margin: var(--space-5) 0 var(--space-2);
      color: var(--muted);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .note {
      margin-top: var(--space-4);
      color: var(--muted);
      font-size: var(--text-xs);
      text-align: center;
    }

    .fab {
      position: fixed;
      right: var(--space-5);
      bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
      z-index: var(--z-nav);
      width: 56px;
      height: 56px;
      border: 0;
      border-radius: 50%;
      background: var(--accent);
      color: var(--on-accent);
      box-shadow: var(--shadow-md);
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
    }

    .fab:hover,
    .fab:active {
      background: var(--accent-hover);
    }
  `,
  template: `
    @for (group of store.groups(); track group.id) {
      <details class="group" open>
        <summary>
          {{ group.title || 'Grupo sin título' }}
          <span class="count">{{ inGroup(group.id).length }}</span>
        </summary>
        @for (card of inGroup(group.id); track card.id) {
          <app-note-row
            grouped
            [card]="card"
            [editing]="editingId() === card.id"
            [caption]="caption(card)"
            (toggled)="toggled.emit(card)"
            (edited)="edited.emit(card)"
            (finished)="finished.emit({ card, value: $event })"
            (removed)="removed.emit(card)"
          />
        } @empty {
          <p class="none">Grupo sin notas</p>
        }
      </details>
    }
    @if (store.groups().length > 0 && loose().length > 0) {
      <h2 class="eyebrow">Sueltas</h2>
    }
    @for (card of loose(); track card.id) {
      <app-note-row
        [card]="card"
        [editing]="editingId() === card.id"
        [caption]="caption(card)"
        (toggled)="toggled.emit(card)"
        (edited)="edited.emit(card)"
        (finished)="finished.emit({ card, value: $event })"
        (removed)="removed.emit(card)"
      />
    }
    @if (empty()) {
      <p class="empty">
        Un folio en blanco.<br />Escribe arriba o pulsa + para crear la primera nota.
      </p>
    }
    <p class="note">Vista de lista: las notas siguen el orden que tienen en el lienzo</p>
    <button type="button" class="fab" aria-label="Nueva nota" (click)="created.emit()">+</button>
  `,
})
export class NotesMobileList {
  protected readonly store = inject(NoteBoardStore);

  readonly editingId = input<string | null>(null);
  readonly empty = input(false);

  readonly toggled = output<NoteCard>();
  readonly edited = output<NoteCard>();
  readonly finished = output<{ card: NoteCard; value: string }>();
  readonly removed = output<NoteCard>();
  readonly created = output<void>();

  protected readonly loose = computed(() => this.store.byPosition(this.store.looseCards()));

  protected inGroup(groupId: string): NoteCard[] {
    return this.store.byPosition(this.store.cardsByGroup().get(groupId) ?? []);
  }

  protected caption(card: NoteCard): string {
    if (!card.doneAt) return '';
    return `Hecha · se oculta en ${formatDuration(remainingMs(card.doneAt, this.store.now()))}`;
  }
}
