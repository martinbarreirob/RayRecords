import { Component, input } from '@angular/core';

/**
 * Header shared by every main screen: the title with a small line next to it (a date, the month
 * on screen...) and, on the right, whatever the screen projects (usually the add button). Having
 * one component keeps the height and spacing the same everywhere.
 */
@Component({
  selector: 'app-page-header',
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-5);
    }

    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-5);
      min-height: var(--control-height);
    }

    .title-block {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 var(--space-3);
    }

    h1 {
      font-size: var(--text-xl);
    }

    .page-eyebrow {
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .page-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
    }

    /*
     * Phone: title and line on the left, the screen's actions on the right, all on one row
     * (a screen may add a second row with display: contents on .page-actions' children).
     */
    @media (width <= 767px) {
      :host {
        margin-bottom: var(--space-4);
      }

      .page-header {
        gap: var(--space-2) var(--space-3);
        min-height: var(--touch-target);
      }

      /* Takes what the actions leave; if the line next to the title does not fit it wraps below. */
      .title-block {
        flex: 1 1 0;
        min-width: 0;
        gap: 0 var(--space-2);
      }

      h1 {
        font-size: 22px;
        letter-spacing: -0.02em;
      }

      .page-eyebrow {
        font-size: var(--text-xs);
      }

      .page-actions {
        flex: none;
        flex-wrap: nowrap;
        gap: var(--space-2);
        margin-left: auto;
      }

      /* The projected actions become items of the header row, so the screen can order them. */
      .page-actions.split {
        display: contents;
      }
    }
  `,
  template: `
    <header class="page-header">
      <div class="title-block">
        <h1>{{ title() }}</h1>
        @if (eyebrow()) {
          <span class="page-eyebrow" aria-live="polite">{{ eyebrow() }}</span>
        }
      </div>
      <div class="page-actions" [class.split]="split()">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  /** On a phone, lets the screen lay its actions out over several rows (see the calendar). */
  readonly split = input(false);
}
