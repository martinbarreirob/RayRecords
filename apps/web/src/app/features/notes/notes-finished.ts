import { Component, input, output } from '@angular/core';
import type { NoteCard } from '@rayrecords/shared';
import { formatStamp, splitNoteText } from './note-board.logic';

/** Panel de «Terminadas»: notas hechas hace más de 24 h, ya fuera del lienzo, con «Recuperar». */
@Component({
  selector: 'app-notes-finished',
  host: { id: 'notes-finished', role: 'region', 'aria-label': 'Notas terminadas' },
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-4);
      padding: var(--space-3) 14px;
      border-radius: var(--radius-md);
      background: var(--surface-2);
      font-size: var(--text-sm);
    }

    ul {
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-top: 1px solid var(--line);
    }

    @media (width <= 767px) {
      li {
        padding: var(--space-1) 0;
      }

      .btn {
        min-height: var(--touch-target);
      }
    }

    .what {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-decoration: line-through;
    }
  `,
  template: `
    <strong>Terminadas ({{ cards().length }})</strong>
    <span class="muted">
      · Las notas hechas se ocultan del lienzo a las 24 h; aquí puedes recuperarlas.
    </span>
    <ul>
      @for (card of cards(); track card.id) {
        <li>
          <span class="what">{{ title(card) }}</span>
          @if (card.doneAt) {
            <span class="muted">{{ stamp(card.doneAt) }}</span>
          }
          <button type="button" class="btn sm" (click)="recovered.emit(card)">Recuperar</button>
        </li>
      } @empty {
        <li class="muted">Todavía no hay notas terminadas ocultas.</li>
      }
    </ul>
  `,
})
export class NotesFinished {
  readonly cards = input.required<readonly NoteCard[]>();
  readonly recovered = output<NoteCard>();

  protected title(card: NoteCard): string {
    return splitNoteText(card.text).title || 'Nota vacía';
  }

  protected stamp(iso: string): string {
    return formatStamp(iso);
  }
}
