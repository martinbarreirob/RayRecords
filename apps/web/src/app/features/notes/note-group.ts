import { Component, input, output } from '@angular/core';
import type { NoteGroup } from '@rayrecords/shared';

/**
 * Canvas group: box with a draggable header, editable title, «Disolver» and a resize handle.
 * The group's cards are projected into a stack, one under another at full width; with cards the
 * height comes from the content (without them, the saved height).
 */
@Component({
  selector: 'app-note-group',
  host: {
    '[class.drop-target]': 'dropTarget()',
    '[class.moving]': 'moving()',
    '[class.locked]': 'locked()',
    '[attr.data-group-id]': 'group().id',
    '[style.left.px]': 'box().x',
    '[style.top.px]': 'box().y',
    '[style.width.px]': 'box().w',
    '[style.height.px]': 'count() > 0 ? null : box().h',
  },
  styles: `
    /*
     * The border is drawn with an inner shadow, not a border: that way the origin of child cards
     * (position: absolute) matches the group's x/y exactly, with no 1.5 px jumps when dropped.
     * The target group highlight is a dashed outline whose colour is animated (the style is not).
     */
    :host {
      position: absolute;
      border-radius: var(--radius-xl);
      background: var(--surface-2);
      box-shadow:
        inset 0 0 0 1.5px var(--line),
        0 0 0 0 transparent;
      outline: 2px dashed transparent;
      outline-offset: -6px;
      transition:
        background-color 0.16s,
        box-shadow 0.18s ease,
        outline-color 0.16s;
    }

    /*
     * When dragged it lifts with an accent outline and a contained shadow (not the large one of
     * cards: on such a wide box it would draw the canvas edge, which clips what overflows).
     */
    :host(.moving) {
      box-shadow:
        inset 0 0 0 1.5px var(--accent),
        var(--shadow-md);
    }

    :host(.drop-target) {
      background: var(--accent-soft);
      outline-color: var(--accent);
      box-shadow:
        inset 0 0 0 1.5px var(--accent),
        0 0 0 0 transparent;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition: none;
      }
    }

    /* Cards stack at full width; the group grows in height to contain them. */
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 0 var(--space-3) var(--space-5);
    }

    .stack:empty {
      display: none;
    }

    header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }

    /* Locked layout: neither hand nor resize handle active. */
    :host(.locked) header {
      cursor: default;
    }

    :host(.locked) .resize {
      cursor: default;
    }

    .handle {
      color: var(--muted);
    }

    .title {
      flex: 1;
      min-width: 0;
      padding: 2px var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text);
      font-weight: 600;
      cursor: text;
    }

    .title:hover {
      background: var(--surface);
    }

    .title:focus-visible {
      outline: none;
      border-color: var(--accent);
      background: var(--surface);
    }

    .title::placeholder {
      color: var(--muted);
      font-weight: 400;
    }

    .count {
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .dissolve {
      opacity: 0;
      transition: opacity 0.12s;
    }

    :host(:hover) .dissolve,
    :host(:focus-within) .dissolve,
    .dissolve:focus-visible {
      opacity: 1;
    }

    /* Without a mouse there is no hover: the button is always visible and the handle is larger. */
    @media (hover: none) {
      .dissolve {
        opacity: 1;
      }

      .resize {
        width: 36px;
        height: 36px;
      }

      .resize::after {
        right: 10px;
        bottom: 10px;
      }
    }

    .hint {
      position: absolute;
      right: var(--space-4);
      bottom: var(--space-3);
      color: var(--accent);
      font-size: var(--text-xs);
      pointer-events: none;
    }

    .resize {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      touch-action: none;
    }

    .resize::after {
      content: '';
      position: absolute;
      right: 5px;
      bottom: 5px;
      width: 8px;
      height: 8px;
      border-right: 2px solid var(--line-strong);
      border-bottom: 2px solid var(--line-strong);
      border-bottom-right-radius: 3px;
    }

    .resize:hover::after {
      border-color: var(--accent);
    }
  `,
  template: `
    <header (pointerdown)="headerPressed.emit($event)">
      <span class="handle" aria-hidden="true">⠿</span>
      <input
        #title
        class="title"
        type="text"
        placeholder="Grupo sin título"
        aria-label="Título del grupo"
        [value]="group().title"
        (pointerdown)="$event.stopPropagation()"
        (keydown.enter)="title.blur()"
        (change)="renamed.emit(title.value)"
      />
      <span class="count"
        ><span aria-hidden="true">{{ count() }}</span
        ><span class="sr-only">{{
          count() === 1 ? ' nota en el grupo' : ' notas en el grupo'
        }}</span></span
      >
      <button
        type="button"
        class="btn ghost sm dissolve"
        title="Quita el grupo; las notas se quedan donde están"
        (pointerdown)="$event.stopPropagation()"
        (click)="dissolved.emit()"
      >
        Disolver
      </button>
    </header>
    <div class="stack"><ng-content /></div>
    @if (dropTarget()) {
      <span class="hint">Suelta para añadir al grupo</span>
    }
    <span class="resize" role="presentation" (pointerdown)="resizePressed.emit($event)"></span>
  `,
})
export class NoteGroupComponent {
  readonly group = input.required<NoteGroup>();
  /** Position and size shown (they include the drag or resize in progress). */
  readonly box = input.required<{ x: number; y: number; w: number; h: number }>();
  readonly count = input(0);
  readonly dropTarget = input(false);
  readonly moving = input(false);
  /** Locked layout: only the cursor changes (the page decides what can be moved). */
  readonly locked = input(false);

  readonly headerPressed = output<PointerEvent>();
  readonly resizePressed = output<PointerEvent>();
  readonly renamed = output<string>();
  readonly dissolved = output<void>();
}
