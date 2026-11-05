import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import type { NoteCard } from '@rayrecords/shared';
import { splitNoteText } from './note-board.logic';
import { NoteCheck } from './note-check';
import { NoteEditor } from './note-editor';

/** Fila de la lista móvil (< 768 px): casilla de 44 px, texto que se edita al tocarlo. */
@Component({
  selector: 'app-note-row',
  imports: [NoteCheck, NoteEditor],
  host: { '[class.grouped]': 'grouped()', '[class.done]': '!!card().doneAt' },
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-height: var(--touch-target);
      padding: var(--space-3) 14px;
      background: var(--surface);
      /* Al enfocar el editor, deja sitio para el botón flotante de «Nueva nota». */
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

    /* El foco de teclado se ve en el borde de la propia fila, no en un anillo aparte por fuera. */
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

    /* Toda la fila (no solo el texto) es tocable: el área llega hasta el borde de la tarjeta. */
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

    .actions {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .actions .btn {
      min-height: var(--touch-target);
    }
  `,
  template: `
    <app-note-check [checked]="!!card().doneAt" label="Hecha" (toggled)="toggled.emit()" />
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
          <!-- pointerdown evita que el campo pierda el foco y guarde antes de actuar -->
          <button
            type="button"
            class="btn danger sm"
            (pointerdown)="$event.preventDefault()"
            (click)="removed.emit()"
          >
            Borrar
          </button>
          <button
            type="button"
            class="btn primary sm"
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
}
