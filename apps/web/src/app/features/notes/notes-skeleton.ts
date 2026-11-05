import { Component, booleanAttribute, input } from '@angular/core';
import { NOTE_CARD_WIDTH } from '@rayrecords/shared';

/** Tarjeta fantasma del lienzo: posición y ancho de las líneas de texto (en % del cuerpo). */
interface GhostCard {
  x: number;
  y: number;
  lines: number[];
}

/** Grupo fantasma con sus tarjetas (coordenadas relativas a la caja, como las reales). */
interface GhostGroup {
  x: number;
  y: number;
  w: number;
  h: number;
  cards: GhostCard[];
}

/**
 * Esqueleto de carga de Notas. En escritorio dibuja tarjetas y un grupo en posiciones plausibles del
 * lienzo (se coloca dentro de la caja del lienzo, que lo recorta); en móvil, filas como las de la
 * lista. Los bloques son decorativos (`aria-hidden`) y un `role="status"` solo para lector de pantalla
 * avisa de la carga. Aparece con un retraso en CSS (sin temporizadores): una carga rápida no lo enseña.
 */
@Component({
  selector: 'app-notes-skeleton',
  host: { '[class.compact]': 'compact()' },
  styles: `
    :host {
      display: block;
      opacity: 0;
      animation: skeleton-in 0.2s ease-out 0.15s forwards;
    }

    /* Escritorio: llena la caja del lienzo, sin recibir clics. */
    :host(:not(.compact)) {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    @keyframes skeleton-in {
      to {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation-duration: 0.01s;
      }
    }

    /* Mismas medidas que app-note-card: borde, relleno de 12 px y casilla redonda de 18 px. */
    .ghost-card {
      position: absolute;
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
    }

    .ghost-card .circle {
      width: 18px;
      height: 18px;
      margin-top: 1px;
    }

    .body {
      display: grid;
      flex: 1;
      gap: var(--space-2);
      align-content: start;
      min-width: 0;
      padding-top: 6px;
    }

    /* Mismas medidas que app-note-group: caja con cabecera y las tarjetas dentro. */
    .ghost-group {
      position: absolute;
      border-radius: var(--radius-xl);
      background: var(--surface-2);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }

    .group-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
    }

    .group-head .title {
      width: 120px;
    }

    .group-head .pill {
      width: 20px;
      height: 16px;
    }

    /* Móvil: filas como las de la lista de notas (casilla de 22 px y una o dos líneas). */
    .ghost-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      min-height: var(--touch-target);
      margin-bottom: var(--space-2);
      padding: var(--space-3) 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .ghost-row .circle {
      width: 22px;
      height: 22px;
    }

    .ghost-row .body {
      padding-top: 6px;
    }
  `,
  template: `
    <span class="sr-only" role="status">Cargando notas…</span>

    @if (compact()) {
      <div aria-hidden="true">
        @for (lines of rows; track $index) {
          <div class="ghost-row">
            <span class="skeleton circle"></span>
            <div class="body">
              @for (width of lines; track $index) {
                <span class="skeleton line" [style.width.%]="width"></span>
              }
            </div>
          </div>
        }
      </div>
    } @else {
      <div aria-hidden="true">
        @for (card of cards; track $index) {
          <div
            class="ghost-card"
            [style.left.px]="card.x"
            [style.top.px]="card.y"
            [style.width.px]="width"
          >
            <span class="skeleton circle"></span>
            <div class="body">
              @for (line of card.lines; track $index) {
                <span class="skeleton line" [style.width.%]="line"></span>
              }
            </div>
          </div>
        }

        <div
          class="ghost-group"
          [style.left.px]="group.x"
          [style.top.px]="group.y"
          [style.width.px]="group.w"
          [style.height.px]="group.h"
        >
          <div class="group-head">
            <span class="skeleton title"></span>
            <span class="skeleton pill"></span>
          </div>
          @for (card of group.cards; track $index) {
            <div
              class="ghost-card"
              [style.left.px]="card.x"
              [style.top.px]="card.y"
              [style.width.px]="width"
            >
              <span class="skeleton circle"></span>
              <div class="body">
                @for (line of card.lines; track $index) {
                  <span class="skeleton line" [style.width.%]="line"></span>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class NotesSkeleton {
  /** Lista de filas (móvil) en lugar de lienzo (escritorio). */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly width = NOTE_CARD_WIDTH;
  protected readonly cards: GhostCard[] = [
    { x: 16, y: 16, lines: [70, 100, 60] },
    { x: 312, y: 16, lines: [55, 90] },
    { x: 608, y: 16, lines: [80, 100, 45] },
  ];
  protected readonly group: GhostGroup = {
    x: 16,
    y: 160,
    w: 600,
    h: 188,
    cards: [
      { x: 16, y: 52, lines: [65, 100, 85] },
      { x: 312, y: 52, lines: [50, 90] },
    ],
  };
  /** Líneas de cada fila fantasma del móvil (una o dos). */
  protected readonly rows = [[70], [85, 55], [60], [90, 40], [75], [50, 80]];
}
