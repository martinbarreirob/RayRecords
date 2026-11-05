import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import type { NoteCard } from '@rayrecords/shared';
import { splitNoteText } from './note-board.logic';
import { NoteCheck } from './note-check';
import { NoteEditor } from './note-editor';

/** Row of the mobile list (< 768 px): 44 px checkbox, text that is edited by tapping it. */
@Component({
  selector: 'app-note-row',
  imports: [NoteCheck, NoteEditor],
  host: {
    '[class.grouped]': 'grouped()',
    '[class.done]': '!!card().doneAt',
    '[class.creating]': 'creating()',
  },
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-height: var(--touch-target);
      padding: var(--space-3) 14px;
      background: var(--surface);
      /* When the editor is focused, leave room for the floating «Nueva nota» button. */
      scroll-margin-bottom: 96px;
    }

    :host(:not(.grouped)) {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-2);
    }

    :host(.grouped) {
      border-top: 1px solid var(--line);
    }

    :host(.done) {
      opacity: 0.7;
    }

    :host(.done) .title {
      text-decoration: line-through;
    }

    .main {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    /* Keyboard focus shows on the row's own border, not in a separate ring outside. */
    :host(:has(.text:focus-visible)) {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    .text:focus-visible {
      outline: none;
    }

    .text {
      display: block;
      width: 100%;
      min-height: 24px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    /* The whole row (not only the text) is tappable: the area reaches the edge of the card. */
    .text::after {
      content: '';
      position: absolute;
      inset: calc(var(--space-3) * -1) -14px calc(var(--space-3) * -1) 0;
    }

    .text > span {
      display: block;
    }

    .title {
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .title.placeholder {
      color: var(--muted);
      font-weight: 400;
    }

    .rest {
      margin-top: 2px;
      color: var(--muted);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
      white-space: pre-line;
    }

    .caption {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .editor {
      display: block;
      width: 100%;
      min-height: 4.5em;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      line-height: 1.5;
      resize: none;
      field-sizing: content;
    }

    .editor:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    /* Two equal, wide buttons side by side (never a narrow tall pair). */
    .actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .actions .btn {
      flex: 1;
      min-height: var(--touch-target);
      padding: 0 var(--space-4);
      font-size: var(--text-base);
      white-space: nowrap;
    }

    /* A note being created has no check to tick yet: the editor takes the whole row. */
    :host(.creating) {
      padding: var(--space-3);
    }
  `,
  template: `
    @if (!creating()) {
      <app-note-check [checked]="!!card().doneAt" label="Hecha" (toggled)="toggled.emit()" />
    }
    <div class="main">
      @if (editing()) {
        <textarea
          #editor
          appNoteEditor
          class="editor"
          rows="3"
          aria-label="Texto de la nota"
          [value]="card().text"
          (keydown.escape)="editor.blur()"
          (blur)="finished.emit(editor.value)"
        ></textarea>
        <div class="actions">
          <!-- pointerdown keeps the field from losing focus and saving before acting -->
          @if (creating()) {
            <!-- A blank text is discarded without leaving anything to undo -->
            <button
              type="button"
              class="btn"
              (pointerdown)="$event.preventDefault()"
              (click)="editor.value = ''; editor.blur()"
            >
              Cancelar
            </button>
          } @else {
            <button
              type="button"
              class="btn danger"
              (pointerdown)="$event.preventDefault()"
              (click)="removed.emit()"
            >
              Borrar
            </button>
          }
          <button
            type="button"
            class="btn primary"
            (pointerdown)="$event.preventDefault()"
            (click)="editor.blur()"
          >
            Listo
          </button>
        </div>
      } @else {
        <button type="button" class="text" (click)="edited.emit()">
          <span class="title" [class.placeholder]="!parts().title">
            {{ parts().title || 'Nota vacía' }}
          </span>
          @if (parts().body) {
            <span class="rest">{{ parts().body }}</span>
          }
          @if (caption()) {
            <span class="caption">{{ caption() }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class NoteRow {
  readonly card = input.required<NoteCard>();
  readonly grouped = input(false, { transform: booleanAttribute });
  readonly editing = input(false);
  readonly caption = input('');

  readonly toggled = output<void>();
  readonly edited = output<void>();
  readonly finished = output<string>();
  readonly removed = output<void>();

  protected readonly parts = computed(() => splitNoteText(this.card().text));
  /** A note being written for the first time: nothing saved yet, so no check and «Cancelar». */
  protected readonly creating = computed(() => this.editing() && this.card().text === '');
}
