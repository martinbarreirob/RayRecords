import { Component, input, output } from '@angular/core';

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

    .title-link {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;

      &:hover {
        color: var(--accent);
      }
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

      /* No fixed height: with no visible title and no actions the header takes no room at all. */
      .page-header {
        gap: var(--space-2) var(--space-3);
        min-height: 0;
      }

      :host(:has(.page-actions:empty)) {
        margin-bottom: 0;
      }

      /*
       * The section tabs of the shell already name the screen, so the h1 stays only for screen
       * readers (and the eyebrow too when hideEyebrowOnMobile is set).
       */
      h1,
      .title-block.compact {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      /* Takes what the actions leave; if the line next to the title does not fit it wraps below. */
      .title-block {
        flex: 1 1 0;
        min-width: 0;
        gap: 0 var(--space-2);
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

      /* Opt-in: the actions take the whole row, so a flexible child (flex: 1) can fill it. */
      .page-actions.stretch {
        flex: 1 1 0;
        margin-left: 0;
      }
    }
  `,
  template: `
    <header class="page-header">
      <div class="title-block" [class.compact]="hideEyebrowOnMobile() || !eyebrow()">
        <h1>
          @if (titleLink()) {
            <button type="button" class="title-link" (click)="titlePressed.emit()">
              {{ title() }}
            </button>
          } @else {
            {{ title() }}
          }
        </h1>
        @if (eyebrow()) {
          <span class="page-eyebrow" aria-live="polite">{{ eyebrow() }}</span>
        }
      </div>
      <div class="page-actions" [class.split]="split()" [class.stretch]="stretchActions()">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  /** Renders the title as a button that emits `titlePressed` (a way back to the section). */
  readonly titleLink = input(false);
  readonly titlePressed = output<void>();
  /** On a phone, lets the screen lay its actions out over several rows (see the calendar). */
  readonly split = input(false);
  /** On a phone, the actions take the full row width (a child with flex: 1 then fills what is left). */
  readonly stretchActions = input(false);
  /** On a phone the eyebrow is hidden too when it only repeats the area tab (for example "Gestión"). */
  readonly hideEyebrowOnMobile = input(false);
}
