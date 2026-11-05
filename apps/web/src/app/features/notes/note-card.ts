import { Component, booleanAttribute, computed, input, output, signal } from '@angular/core';
import type { NoteCard } from '@rayrecords/shared';
import { splitNoteText } from './note-board.logic';
import { NoteCheck } from './note-check';
import { NoteEditor } from './note-editor';

/** Note card on the canvas. Position, size and state arrive as inputs; the page orchestrates dragging. */
@Component({
  selector: 'app-note-card',
  imports: [NoteCheck, NoteEditor],
  host: {
    '[attr.tabindex]': 'ghost() ? null : 0',
    '[attr.role]': 'ghost() ? null : "group"',
    '[attr.aria-label]': 'ghost() ? null : label()',
    '[attr.inert]': 'ghost() ? "" : null',
    '[attr.data-card-id]': 'ghost() ? null : card().id',
    '[class.selected]': 'selected()',
    '[class.editing]': 'editing()',
    '[class.done]': '!!card().doneAt',
    '[class.dragging]': 'dragging()',
    '[class.settling]': 'settling()',
    '[class.ghost]': 'ghost()',
    '[class.landing]': 'landing()',
    '[class.locked]': 'locked()',
    '[class.by-pointer]': 'byPointer()',
    '[class.stacked]': 'stacked()',
    '[attr.data-stacked]': 'stacked() && !ghost() ? "" : null',
    '[style.left.px]': 'stacked() ? null : card().x',
    '[style.top.px]': 'stacked() ? null : card().y',
    '[style.width.px]': 'stacked() ? null : card().w',
    '[style.z-index]': 'zIndex()',
    '(pointerdown)': 'onPointerDown($event)',
    '(blur)': 'byPointer.set(false)',
    '(keydown)': 'onKeydown($event)',
    '(focus)': 'focused.emit()',
    '(dblclick)': 'onDblClick($event)',
  },
  styles: `
    :host {
      position: absolute;
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      cursor: grab;
      user-select: none;
      touch-action: none;
      /* left/top are never transitioned: the card would follow the pointer with a delay. */
      transition:
        border-color 0.12s,
        background-color 0.15s,
        box-shadow 0.16s ease,
        scale 0.16s ease,
        opacity 0.16s;
    }

    :host(:hover) {
      border-color: var(--line-strong);
    }

    /* Inside a group it is not placed freely: it takes the group's width, in the stack. */
    :host(.stacked) {
      position: relative;
    }

    /* Locked layout: it cannot be picked up, so no grab hand is offered. */
    :host(.locked) {
      cursor: default;
    }

    /*
     * A single border. The global :focus-visible ring is removed here (the :host(...) selector outweighs
     * the global one, no !important) and keyboard focus is drawn INSIDE the border itself.
     * Selected: 2 px accent border (1 px border and 1 px inner).
     */
    :host(:focus-visible) {
      outline: none;
    }

    :host(.selected) {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    /*
     * Keyboard focus: double inner line (accent, gap, accent), nothing outside. With the
     * pointer (click, Shift+click) it is not drawn: only the selection border applies.
     */
    :host(:focus-visible:not(.by-pointer)) {
      border-color: var(--accent);
      box-shadow:
        inset 0 0 0 2px var(--surface),
        inset 0 0 0 3px var(--accent);
    }

    :host(.selected:focus-visible:not(.by-pointer)) {
      box-shadow:
        inset 0 0 0 1px var(--accent),
        inset 0 0 0 3px var(--surface),
        inset 0 0 0 4px var(--accent);
    }

    :host(.editing) {
      border-color: var(--accent);
      box-shadow:
        inset 0 0 0 1px var(--accent),
        var(--shadow-md);
      cursor: text;
      touch-action: auto;
    }

    :host(.done) {
      opacity: 0.7;
    }

    :host(.done) .title {
      text-decoration: line-through;
    }

    /* Mark left at the origin while the card «flies»: dashed outline and faint text. */
    :host(.dragging) {
      border-style: dashed;
      border-color: var(--line-strong);
      background: var(--surface-2);
      box-shadow: none;
      opacity: 1;
    }

    :host(.dragging) > * {
      opacity: 0.35;
    }

    /* While the card lands, the real one waits underneath, hidden. */
    :host(.settling) {
      visibility: hidden;
    }

    /* The lifted card: no rotation or tilt, slightly larger and with more shadow. */
    :host(.ghost) {
      border-color: var(--accent);
      box-shadow:
        inset 0 0 0 1px var(--accent),
        var(--shadow-lg);
      scale: 1.015;
      opacity: 1;
      cursor: grabbing;
      pointer-events: none;
      animation: lift 0.16s ease-out;
    }

    :host(.ghost.landing) {
      box-shadow:
        inset 0 0 0 1px var(--accent),
        0 0 0 0 transparent;
      scale: 1;
      animation: none;
    }

    :host(.ghost.landing.done) {
      opacity: 0.7;
    }

    @keyframes lift {
      from {
        box-shadow:
          inset 0 0 0 1px var(--accent),
          0 0 0 0 transparent;
        scale: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      :host(.ghost) {
        transition: none;
        animation: none;
      }
    }

    .body {
      min-width: 0;
      flex: 1;
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
      line-height: 1.5;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }

    .caption {
      margin-top: 2px;
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .editor {
      display: block;
      flex: 1;
      min-width: 0;
      min-height: 3em;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text);
      line-height: 1.5;
      resize: none;
      field-sizing: content;
      cursor: text;
      user-select: text;
    }

    .editor:focus-visible {
      outline: none;
    }

    .toolbar {
      position: absolute;
      top: -42px;
      left: -1px;
      display: flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: 9px;
      background: var(--surface);
      box-shadow: var(--shadow-md);
      white-space: nowrap;
      cursor: default;
    }

    .toolbar.below {
      top: calc(100% + 6px);
    }

    .toolbar button {
      padding: 4px 9px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      font-size: var(--text-xs);
      cursor: pointer;
    }

    .toolbar button:hover {
      background: var(--surface-2);
    }

    .toolbar button.quiet {
      color: var(--muted);
    }

    .toolbar button.quiet:hover {
      background: var(--danger-soft);
      color: var(--danger);
    }
  `,
  template: `
    <!-- A note being written for the first time has nothing to tick yet: the check appears once saved. -->
    @if (!creating()) {
      <app-note-check [checked]="!!card().doneAt" label="Hecha" (toggled)="toggled.emit()" />
    }
    @if (editing()) {
      <textarea
        #editor
        appNoteEditor
        class="editor"
        rows="2"
        aria-label="Texto de la nota"
        [value]="card().text"
        (pointerdown)="$event.stopPropagation()"
        (dblclick)="$event.stopPropagation()"
        (keydown.escape)="editor.blur()"
        (keydown.control.enter)="editor.blur()"
        (blur)="finished.emit(editor.value)"
      ></textarea>
    } @else {
      <div class="body">
        <div class="title" [class.placeholder]="!parts().title">
          {{ parts().title || 'Nota vacía' }}
        </div>
        @if (parts().body) {
          <div class="rest">{{ parts().body }}</div>
        }
        @if (caption()) {
          <div class="caption">{{ caption() }}</div>
        }
      </div>
    }

    @if (toolbar()) {
      <div
        class="toolbar"
        role="toolbar"
        aria-label="Acciones de la nota"
        [class.below]="toolbarBelow()"
        (pointerdown)="$event.stopPropagation()"
        (dblclick)="$event.stopPropagation()"
      >
        <button type="button" (click)="toggled.emit()">
          {{ card().doneAt ? 'Reabrir' : 'Hecha' }}
        </button>
        <button type="button" (click)="groupSelected.emit()">Agrupar</button>
        <button type="button" class="quiet" (click)="removed.emit()">Borrar</button>
      </div>
    }
  `,
})
export class NoteCardComponent {
  readonly card = input.required<NoteCard>();
  readonly selected = input(false);
  readonly editing = input(false);
  readonly dragging = input(false);
  /** The card was just dropped: its «flying» copy is still landing on top. */
  readonly settling = input(false);
  /** Only for the flying copy: it has been dropped and is settling. */
  readonly landing = input(false);
  /** Card that «flies» under the pointer while dragging: no interaction. */
  readonly ghost = input(false, { transform: booleanAttribute });
  /** «Hecha · se oculta en X» text. */
  readonly caption = input('');
  /** Locked layout: only the cursor changes (the page decides what can be moved). */
  readonly locked = input(false);
  /** Card of a group: goes in the group's stack, with no position of its own (ignores x, y and w). */
  readonly stacked = input(false);
  readonly toolbar = input(false);
  readonly toolbarBelow = input(false);

  readonly pressed = output<PointerEvent>();
  readonly focused = output<void>();
  readonly edited = output<void>();
  readonly finished = output<string>();
  readonly toggled = output<void>();
  readonly groupSelected = output<void>();
  readonly removed = output<void>();

  protected readonly parts = computed(() => splitNoteText(this.card().text));
  protected readonly creating = computed(() => this.editing() && this.card().text === '');
  protected readonly label = computed(() => {
    const { title } = this.parts();
    return `${this.card().doneAt ? 'Hecha: ' : ''}${title || 'Nota vacía'}`;
  });
  protected readonly zIndex = computed(() => {
    if (this.ghost()) return 10_000;
    return this.selected() ? 9_000 : this.card().z + 1;
  });

  /** The last focus came from the pointer: the keyboard focus ring is not drawn (see styles). */
  protected readonly byPointer = signal(false);

  protected onPointerDown(event: PointerEvent): void {
    this.byPointer.set(true);
    this.pressed.emit(event);
  }

  /** A real key press (not just holding Shift or Ctrl, which repeats) returns focus to the keyboard. */
  protected onKeydown(event: KeyboardEvent): void {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) this.byPointer.set(false);
  }

  protected onDblClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.ghost()) this.edited.emit();
  }
}
