import { Component, computed, input } from '@angular/core';
import type { BoardColumn, ColumnIcon } from '@rayrecords/shared';

/** The name of each icon, as the column editor offers them. */
export const STATUS_LABELS: Readonly<Record<ColumnIcon, string>> = {
  backlog: 'Backlog',
  todo: 'To do',
  progress: 'In progress',
  review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
  canceled: 'Canceled',
};

/** The part of the circle a half-way state fills, from the top clockwise. */
const FILLED: Partial<Record<ColumnIcon, number>> = { progress: 0.5, review: 0.75 };

/**
 * The state of a card as a simple circle: dashed for the backlog, empty for to do, partly filled
 * for in progress and in review, a minus for blocked, a tick for done and a cross for canceled.
 * It takes the colour of the column (`--hue`, from a `.hue-*` class or an inline style).
 */
@Component({
  selector: 'app-status-icon',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }

    svg {
      width: 1.2em;
      height: 1.2em;
    }

    .ring {
      fill: none;
      stroke: var(--hue, var(--line-strong));
      stroke-width: 1.5;
    }

    .ring.dashed {
      stroke-dasharray: 2.2 2.2;
    }

    .fill {
      fill: var(--hue, var(--line-strong));
    }

    .glyph {
      fill: none;
      stroke: var(--surface);
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  template: `
    <svg viewBox="0 0 16 16" focusable="false">
      @switch (kind()) {
        @case ('done') {
          <circle class="fill" cx="8" cy="8" r="7.25" />
          <path class="glyph" d="M5 8.3l2 2l4 -4.4" />
        }
        @case ('canceled') {
          <circle class="fill" cx="8" cy="8" r="7.25" />
          <path class="glyph" d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
        }
        @case ('blocked') {
          <circle class="fill" cx="8" cy="8" r="7.25" />
          <path class="glyph" d="M5 8h6" />
        }
        @default {
          <circle class="ring" [class.dashed]="kind() === 'backlog'" cx="8" cy="8" r="6.5" />
          @if (pie(); as d) {
            <path class="fill" [attr.d]="d" />
          }
        }
      }
    </svg>
  `,
})
export class StatusIcon {
  readonly kind = input.required<ColumnIcon>();

  protected readonly pie = computed(() => {
    const f = FILLED[this.kind()];
    if (!f) return '';
    const angle = f * 2 * Math.PI;
    const r = 3.6;
    const x = 8 + r * Math.sin(angle);
    const y = 8 - r * Math.cos(angle);
    return `M8 8 L8 ${8 - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
  });
}

/** The icon of a column that has none chosen: to do first, done last and in progress between. */
export function defaultIcon(index: number, count: number): ColumnIcon {
  if (count <= 1 || index <= 0) return 'todo';
  return index >= count - 1 ? 'done' : 'progress';
}

/** The icon a column shows: the one chosen for it, else by position. */
export function columnIcon(
  column: Pick<BoardColumn, 'icon'> | undefined,
  index: number,
  count: number,
): ColumnIcon {
  return column?.icon ?? defaultIcon(index, count);
}
