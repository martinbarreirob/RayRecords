import { Component } from '@angular/core';

/**
 * Placeholder shown for a moment when switching between the expenses views. It is a generic
 * shape (a toolbar and a few rows) because it stands in for any of the five views. The blocks are
 * decorative and a screen-reader-only status announces the load.
 */
@Component({
  selector: 'app-expenses-skeleton',
  styles: `
    :host {
      display: block;
    }

    /* A faster, clearer shimmer than the global one: the placeholder only lives half a second. */
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--surface-2) 0%,
        var(--line) 50%,
        var(--surface-2) 100%
      );
      background-size: 200% 100%;
      animation-duration: 0.9s;
    }

    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .bar .skeleton {
      height: var(--control-height);
      border-radius: var(--radius-sm);
    }

    .rows {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .row {
      display: grid;
      grid-template-columns: 90px minmax(0, 1fr) 110px 80px;
      align-items: center;
      gap: var(--space-4);
      min-height: 47px;
      padding: 0 0.875rem;
      border-top: 1px solid var(--line-soft);
    }

    .row:first-child {
      min-height: 38px;
      border-top: 0;
      background: var(--surface-2);
    }

    @media (width <= 767px) {
      .row {
        grid-template-columns: minmax(0, 1fr) 80px;
      }

      .row .col-opt {
        display: none;
      }
    }
  `,
  template: `
    <span class="sr-only" role="status">Cargando…</span>
    <div aria-hidden="true">
      <div class="bar">
        <span class="skeleton" style="width: 180px"></span>
        <span class="skeleton" style="width: 120px"></span>
      </div>
      <div class="rows">
        @for (width of widths; track $index) {
          <div class="row">
            <span class="col-opt skeleton line" style="width: 60px"></span>
            <span class="skeleton line" [style.width.%]="width"></span>
            <span class="col-opt skeleton line" style="width: 80px"></span>
            <span class="skeleton line" style="width: 56px"></span>
          </div>
        }
      </div>
    </div>
  `,
})
export class ExpensesSkeleton {
  protected readonly widths = [0, 55, 70, 42, 62, 50, 66, 45];
}
