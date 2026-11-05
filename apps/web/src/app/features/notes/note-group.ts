import { Component, input, output } from '@angular/core';
import type { NoteGroup } from '@rayrecords/shared';

/**
 * Grupo del lienzo: caja con cabecera arrastrable, título editable, «Disolver» y tirador de tamaño.
 * Las tarjetas del grupo se proyectan en una pila, una debajo de otra y a todo el ancho; con tarjetas
 * el alto lo da el contenido (sin ellas, el alto guardado).
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
     * El borde se pinta con una sombra interior y no con border: así el origen de las tarjetas hijas
     * (position: absolute) coincide exactamente con x/y del grupo y no hay saltos de 1,5 px al soltarlas.
     * El resaltado del grupo destino es un contorno discontinuo cuyo color se anima (el estilo no se anima).
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
     * Al arrastrarlo se levanta con un contorno de acento y una sombra contenida (no la grande de las
     * tarjetas: en una caja tan ancha dibujaría el borde del lienzo, que recorta lo que se sale).
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

    /* Las tarjetas se apilan a todo el ancho; el grupo crece en alto para contenerlas. */
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

    /* Disposición bloqueada: ni mano ni tirador de tamaño activos. */
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

    /* Sin ratón no hay hover: el botón se ve siempre y el tirador es más grande. */
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
  /** Posición y tamaño que se muestran (incluyen el arrastre o el redimensionado en curso). */
  readonly box = input.required<{ x: number; y: number; w: number; h: number }>();
  readonly count = input(0);
  readonly dropTarget = input(false);
  readonly moving = input(false);
  /** Disposición bloqueada: solo cambia el cursor (la pantalla decide qué se puede mover). */
  readonly locked = input(false);

  readonly headerPressed = output<PointerEvent>();
  readonly resizePressed = output<PointerEvent>();
  readonly renamed = output<string>();
  readonly dissolved = output<void>();
}
