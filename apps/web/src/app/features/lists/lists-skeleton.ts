import { Component, input } from '@angular/core';

/** Shape of the content being awaited: list grid, items table or Kanban board. */
export type ListsSkeletonVariant = 'grid' | 'table' | 'board';

/**
 * Loading skeleton of the lists screens. It mirrors the measures of the real content (cards, table
 * rows, board columns) so there are no jumps when data arrives. The blocks are decorative
 * (`aria-hidden`) and a screen-reader-only `role="status"` announces the load.
 * It appears after a CSS delay (no timers): if data arrives first, it is never seen.
 */
@Component({
  selector: 'app-lists-skeleton',
  styles: `
    :host {
      display: block;
      opacity: 0;
      animation: skeleton-in 0.2s ease-out 0.15s forwards;
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

    /* Widths of the ghost text and chip blocks. */
    .w-xs {
      width: 38px;
    }

    .w-sm {
      width: 52px;
    }

    .w-md {
      width: 64px;
    }

    .w-lg {
      width: 76px;
    }

    /* Lists grid: same columns, gap and card as the lists screen. */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-4);
    }

    .grid-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 128px;
    }

    .grid-card .title {
      width: 55%;
      height: 24px;
    }

    .grid-card .chips {
      display: flex;
      gap: var(--space-2);
    }

    .grid-card .chips .pill {
      height: 20px;
    }

    .grid-card .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
    }

    .grid-card .foot .line {
      width: 84px;
    }

    .grid-card .foot .btn-ghost {
      width: 72px;
      height: 28px;
      border-radius: var(--radius-md);
    }

    /* Items table: bordered box, grey header and rows as tall as the real ones. */
    .wrap {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .trow {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 150px 80px 72px;
      align-items: center;
      gap: var(--space-3);
      min-height: 47px;
      padding: 0 0.875rem;
      border-top: 1px solid var(--line-soft);
    }

    .trow.head {
      min-height: 38px;
      border-top: 0;
      background: var(--surface-2);
    }

    .trow .check {
      width: 18px;
      height: 18px;
      border-radius: var(--radius-sm);
    }

    .trow .chips {
      display: flex;
      gap: var(--space-1);
    }

    .trow .chips .pill {
      height: 18px;
    }

    .trow .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-1);
    }

    .trow .actions .skeleton {
      width: 20px;
      height: 20px;
    }

    /* Board: columns with their header and cards like the real ones. */
    .board {
      display: flex;
      align-items: flex-start;
      gap: var(--space-5);
      padding: 2px 2px var(--space-4);
      overflow: hidden;
    }

    .column {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 260px;
      max-width: 360px;
    }

    .col-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 36px;
      padding: var(--space-2) var(--space-1) 0;
      border-top: 3px solid var(--line-strong);
      border-radius: 2px;
    }

    .col-head .line {
      width: 90px;
    }

    .col-head .pill {
      width: 24px;
      height: 18px;
    }

    .cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .kcard {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .kcard .title {
      width: 70%;
      height: 16px;
    }

    .kcard .meta {
      display: flex;
      gap: var(--space-2);
    }

    .kcard .meta .pill {
      height: 18px;
    }

    @media (width <= 767px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .trow {
        grid-template-columns: var(--touch-target) minmax(0, 1fr) 72px;
        min-height: 64px;
      }

      .trow .col-opt {
        display: none;
      }

      .column {
        flex: 0 0 84%;
        min-width: 0;
      }
    }
  `,
  template: `
    <span class="sr-only" role="status">{{ message() }}</span>

    @switch (variant()) {
      @case ('grid') {
        <div class="grid" aria-hidden="true">
          @for (n of cards; track n) {
            <div class="card grid-card">
              <span class="skeleton title"></span>
              <div class="chips">
                <span class="skeleton pill w-lg"></span>
                @if (n % 2 === 0) {
                  <span class="skeleton pill w-xs"></span>
                }
              </div>
              <div class="foot">
                <span class="skeleton line"></span>
                <span class="skeleton btn-ghost"></span>
              </div>
            </div>
          }
        </div>
      }
      @case ('table') {
        <div class="wrap" aria-hidden="true">
          <div class="trow head">
            <span></span>
            <span class="skeleton line w-sm"></span>
            <span class="col-opt skeleton line w-md"></span>
            <span class="col-opt skeleton line w-sm"></span>
            <span></span>
          </div>
          @for (width of titleWidths; track $index) {
            <div class="trow">
              <span class="skeleton check"></span>
              <span class="skeleton line" [style.width.%]="width"></span>
              <span class="col-opt chips">
                <span class="skeleton pill w-sm"></span>
                @if ($index % 2 === 0) {
                  <span class="skeleton pill w-xs"></span>
                }
              </span>
              <span class="col-opt skeleton line w-sm"></span>
              <span class="actions">
                <span class="skeleton circle"></span>
                <span class="skeleton circle"></span>
              </span>
            </div>
          }
        </div>
      }
      @case ('board') {
        <div class="board" aria-hidden="true">
          @for (count of columnCards; track $index) {
            <section class="column">
              <div class="col-head">
                <span class="skeleton line"></span>
                <span class="skeleton pill"></span>
              </div>
              <div class="cards">
                @for (n of range(count); track n) {
                  <div class="kcard">
                    <span class="skeleton title" [style.width.%]="n % 2 === 0 ? 55 : 75"></span>
                    @if (n % 2 === 1) {
                      <span class="skeleton line"></span>
                    }
                    <span class="meta">
                      <span class="skeleton pill w-sm"></span>
                      <span class="skeleton pill w-xs"></span>
                    </span>
                  </div>
                }
              </div>
            </section>
          }
        </div>
      }
    }
  `,
})
export class ListsSkeleton {
  readonly variant = input<ListsSkeletonVariant>('table');
  /** Screen-reader text. */
  readonly message = input('Cargando…');

  protected readonly cards = [0, 1, 2, 3, 4, 5];
  protected readonly titleWidths = [48, 62, 40, 55, 70, 45];
  /** Ghost cards per column (2 to 4). */
  protected readonly columnCards = [3, 2, 4];

  protected range(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }
}
