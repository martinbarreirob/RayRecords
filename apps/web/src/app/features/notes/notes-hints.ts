import { Component, computed, input, signal } from '@angular/core';
import { selectionLabel } from './note-board.logic';
import { readHintsOpen, writeHintsOpen } from './notes-prefs';

interface Hint {
  keys: string;
  text: string;
}

/** Only the essentials, on one line. With a locked layout, moving is not mentioned. */
const HINTS: readonly Hint[] = [
  { keys: '', text: 'Arrastra para colocar' },
  { keys: 'Mayús+clic', text: 'o marco: varias' },
  { keys: 'Ctrl G', text: 'agrupa' },
  { keys: 'X', text: 'hecha' },
  { keys: 'Supr', text: 'borra' },
  { keys: 'Ctrl Z', text: 'deshace' },
  { keys: 'Mayús+flechas', text: 'mueve' },
];

const LOCKED_HINTS: readonly Hint[] = [
  { keys: '', text: 'Disposición bloqueada: desbloquea con el candado para mover' },
  ...HINTS.filter((hint) => !['Arrastra para colocar', 'mueve'].includes(hint.text)),
];

/**
 * Canvas footer: a discreet line with the shortcuts, which can be hidden (it is remembered) and, with
 * several notes selected, the selection pill. When hidden, only a small button remains in the corner.
 */
@Component({
  selector: 'app-notes-hints',
  styles: `
    /* No box of its own: the bar is a direct child of the page (aligned with the canvas) and sticks to the bottom edge. */
    :host {
      display: contents;
    }

    .bar {
      position: sticky;
      bottom: 0;
      z-index: var(--z-nav);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 32px;
      margin-top: var(--space-1);
      padding: var(--space-1) var(--space-3);
      background: var(--bg);
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .text .kbd {
      margin-right: 2px;
      font-size: 10px;
    }

    .text .sep {
      margin: 0 var(--space-2);
      opacity: 0.6;
    }

    .pill {
      flex: none;
      padding: 2px var(--space-3);
      border-radius: var(--radius-pill);
      background: var(--accent);
      color: var(--on-accent);
      font-weight: 500;
    }

    /* Hidden: only the button (and the pill if needed), in the corner and taking no space in the flow. */
    .corner {
      position: fixed;
      right: var(--space-4);
      bottom: var(--space-3);
      z-index: var(--z-nav);
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .toggle {
      flex: none;
      min-height: 24px;
      padding: 0 var(--space-2);
      font-size: var(--text-xs);
    }

    .corner .toggle {
      box-shadow: var(--shadow-sm);
    }

    @media (hover: none) {
      .toggle {
        min-height: var(--touch-target);
        padding: 0 var(--space-3);
      }
    }
  `,
  template: `
    @if (open()) {
      <div class="bar" role="note">
        @if (selectedCount() > 1) {
          <span class="pill" role="status">{{ label() }} · Ctrl G agrupa</span>
        }
        <span class="text">
          @for (hint of hints(); track hint.text; let last = $last) {
            @if (hint.keys) {
              <span class="kbd">{{ hint.keys }}</span>
            }
            {{ hint.text }}
            @if (!last) {
              <span class="sep" aria-hidden="true">·</span>
            }
          }
        </span>
        <button
          type="button"
          class="btn ghost sm toggle"
          title="Ocultar los atajos"
          (click)="setOpen(false)"
        >
          Ocultar
        </button>
      </div>
    } @else {
      <div class="corner">
        @if (selectedCount() > 1) {
          <span class="pill" role="status">{{ label() }} · Ctrl G agrupa</span>
        }
        <button
          type="button"
          class="btn sm toggle"
          title="Mostrar los atajos"
          (click)="setOpen(true)"
        >
          Atajos
        </button>
      </div>
    }
  `,
})
export class NotesHints {
  readonly selectedCount = input(0);
  readonly locked = input(false);

  protected readonly hints = computed(() => (this.locked() ? LOCKED_HINTS : HINTS));
  protected readonly open = signal(readHintsOpen());

  protected label(): string {
    return selectionLabel(this.selectedCount());
  }

  protected setOpen(value: boolean): void {
    this.open.set(value);
    writeHintsOpen(value);
  }
}
