import { Component, computed, input } from '@angular/core';
import { PRIORITY_LABELS, priorityLevel, type Priority } from './priority-logic';

/** Left edge of each of the four bars on a 16 × 16 grid (each is 2.2 wide, 1.8 apart). */
const BAR_X = [0.9, 4.9, 8.9, 12.9];

/**
 * The priority of a card: four vertical bars inside a round silhouette. From low to urgent one
 * more bar is dark (the rest stay grey); urgent is a full dark circle with a white exclamation mark.
 */
@Component({
  selector: 'app-priority-icon',
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      overflow: hidden;
      border-radius: 50%;
      line-height: 0;
    }

    svg {
      width: 1.2em;
      height: 1.2em;
    }

    .bar {
      fill: var(--line-strong);
    }

    .on {
      fill: var(--text);
    }

    .mark {
      fill: none;
      stroke: var(--surface);
      stroke-width: 1.8;
      stroke-linecap: round;
    }

    .dot {
      fill: var(--surface);
    }
  `,
  template: `
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      @if (priority() === 'urgent') {
        <circle class="on" cx="8" cy="8" r="8" />
        <path class="mark" d="M8 4.2v4.4" />
        <circle class="dot" cx="8" cy="11.5" r="1.05" />
      } @else {
        @for (x of barX; track x; let i = $index) {
          <rect class="bar" [class.on]="i < level()" [attr.x]="x" y="0" width="2.2" height="16" />
        }
      }
    </svg>
  `,
})
export class PriorityIcon {
  readonly priority = input.required<Priority>();
  protected readonly barX = BAR_X;
  protected readonly level = computed(() => priorityLevel(this.priority()));
  protected readonly label = computed(
    () => `Prioridad ${PRIORITY_LABELS[this.priority()].toLowerCase()}`,
  );
}
