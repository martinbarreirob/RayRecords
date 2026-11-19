import { Component, input } from '@angular/core';

/** The views of the expenses screen that have a skeleton of their own. */
export type SkeletonView = 'movements' | 'review' | 'import' | 'rules';

/**
 * Placeholder shown for a moment when switching between the expenses views. Each view has its
 * own, drawn with the same boxes as the real content (the totals and categories and the table;
 * the review card; the import form; the rules and the categories), so nothing jumps when the
 * real view replaces it. The blocks are decorative and a screen-reader-only status announces
 * the load.
 */
@Component({
  selector: 'app-expenses-skeleton',
  styles: `
    :host {
      display: block;
    }

    /* A faster, clearer shimmer than the global one: the placeholder only lives a moment. */
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

    .box {
      display: block;
    }

    /* Movements: the period and the filter, the totals over the categories, the table. */
    .topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .topline .skeleton {
      height: var(--control-height);
      border-radius: var(--radius-control);
    }

    .layout {
      display: grid;
      grid-template-columns: 270px minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .card {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .balance {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }

    .balance .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .cats {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-2);
    }

    .cat-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 46px;
      padding: 0 var(--space-2);
    }

    .table {
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: 24px 70px minmax(0, 1fr) 90px 150px 28px;
      align-items: center;
      gap: var(--space-4);
      min-height: 41px;
      padding: 0 0.875rem;
      border-top: 1px solid var(--line-soft);
    }

    .row.head {
      min-height: 38px;
      border-top: 0;
      background: var(--surface-2);
    }

    .badge {
      display: inline-block;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
    }

    /* Review: the title with its progress bar, and the card of the merchant being reviewed. */
    .review {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .progress {
      height: 6px;
      border-radius: 3px;
    }

    .review-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-6) var(--space-5);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .chips .skeleton {
      width: 120px;
      height: 36px;
      border-radius: var(--radius-md);
    }

    /* Import: the form with its drop zone, and the actions under it. */
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .drop {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
      border: 1.5px dashed var(--line-strong);
      border-radius: var(--radius-lg);
    }

    .drop .text {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      gap: var(--space-2);
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    /* Rules: a card with its list and the form to add one, then the categories. */
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .rule {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 44px;
      border-bottom: 1px solid var(--line);
    }

    .fields {
      display: grid;
      grid-template-columns: 2fr 1.2fr 1.2fr 150px;
      gap: var(--space-3);
    }

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .line {
      display: block;
      height: 12px;
      border-radius: 6px;
    }

    .pad {
      padding: var(--space-4);
    }

    @media (width <= 1023px) {
      .layout {
        grid-template-columns: 230px minmax(0, 1fr);
      }
    }

    @media (width <= 767px) {
      .layout {
        display: block;
      }

      .side {
        margin-bottom: var(--space-3);
      }

      .cats .cat-row:nth-child(n + 4) {
        display: none;
      }

      .row {
        grid-template-columns: 24px minmax(0, 1fr) 80px;
      }

      .row .opt {
        display: none;
      }

      .fields {
        grid-template-columns: 1fr;
      }

      .drop {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `,
  template: `
    <span class="sr-only" role="status">Cargando…</span>
    <div aria-hidden="true">
      @switch (view()) {
        @case ('movements') {
          <div class="topline">
            <span class="skeleton" style="width: 220px"></span>
            <span class="skeleton" style="width: 280px; max-width: 45%"></span>
          </div>
          <div class="layout">
            <div class="side">
              <div class="card balance">
                <div class="head">
                  <span class="skeleton line" style="width: 56px"></span>
                  <span class="skeleton line" style="width: 96px; height: 20px"></span>
                </div>
                <span class="skeleton line" style="width: 70%"></span>
              </div>
              <div class="card cats">
                @for (width of categoryWidths; track $index) {
                  <div class="cat-row">
                    <span class="skeleton badge"></span>
                    <span class="skeleton line" [style.width.%]="width"></span>
                  </div>
                }
              </div>
            </div>
            <div class="card table">
              <div class="row head">
                <span class="skeleton line"></span>
                <span class="opt skeleton line" style="width: 40px"></span>
                <span class="skeleton line" style="width: 90px"></span>
                <span class="opt skeleton line" style="width: 60px"></span>
                <span class="opt skeleton line" style="width: 70px"></span>
                <span class="opt"></span>
              </div>
              @for (width of rowWidths; track $index) {
                <div class="row">
                  <span class="skeleton line" style="height: 18px; width: 18px"></span>
                  <span class="opt skeleton line" style="width: 48px"></span>
                  <span class="skeleton line" [style.width.%]="width"></span>
                  <span class="skeleton line" style="width: 64px"></span>
                  <span class="opt" style="display: flex; align-items: center; gap: 8px">
                    <span class="skeleton badge"></span>
                    <span class="skeleton line" style="width: 70px"></span>
                  </span>
                  <span class="opt skeleton line" style="height: 24px; width: 24px"></span>
                </div>
              }
            </div>
          </div>
        }
        @case ('review') {
          <div class="review">
            <div>
              <span class="skeleton line" style="width: 200px; height: 20px"></span>
              <span class="skeleton line" style="width: 150px; margin-top: 10px"></span>
              <span class="skeleton progress box" style="margin-top: 12px"></span>
            </div>
            <div class="card review-card">
              <span class="skeleton line" style="width: 160px"></span>
              <span class="skeleton line" style="width: 130px; height: 34px"></span>
              <span class="skeleton line" style="width: 220px; height: 20px"></span>
              <span class="skeleton line" style="width: 300px; max-width: 90%"></span>
              <div class="chips">
                @for (item of chips; track $index) {
                  <span class="skeleton"></span>
                }
              </div>
              <span
                class="skeleton"
                style="width: 320px; max-width: 100%; height: 36px; margin-top: 12px; border-radius: 8px"
              ></span>
            </div>
          </div>
        }
        @case ('import') {
          <div class="card form">
            <span class="skeleton line" style="width: 240px; height: 20px"></span>
            <span class="skeleton line" style="width: 90%"></span>
            <span class="skeleton line" style="width: 60%"></span>
            <div class="drop">
              <span class="skeleton" style="width: 44px; height: 44px; border-radius: 50%"></span>
              <div class="text">
                <span class="skeleton line" style="width: 220px"></span>
                <span class="skeleton line" style="width: 320px; max-width: 90%"></span>
              </div>
              <span class="skeleton" style="width: 130px; height: 36px; border-radius: 8px"></span>
            </div>
            <div class="actions">
              <span class="skeleton line" style="width: 200px; margin-right: auto"></span>
              <span class="skeleton" style="width: 110px; height: 36px; border-radius: 8px"></span>
              <span class="skeleton" style="width: 90px; height: 36px; border-radius: 8px"></span>
            </div>
          </div>
        }
        @case ('rules') {
          <div class="stack">
            <div class="card pad">
              <span class="skeleton line" style="width: 240px; height: 20px"></span>
              <span class="skeleton line" style="width: 80%; margin: 12px 0 16px"></span>
              @for (width of ruleWidths; track $index) {
                <div class="rule">
                  <span class="skeleton line" [style.width.px]="width"></span>
                  <span class="skeleton line" style="width: 76px"></span>
                  <span class="skeleton badge"></span>
                  <span class="skeleton line" style="width: 90px; margin-right: auto"></span>
                  <span
                    class="skeleton"
                    style="width: 36px; height: 20px; border-radius: 99px"
                  ></span>
                </div>
              }
              <div class="fields" style="margin-top: 20px">
                @for (item of fields; track $index) {
                  <span class="skeleton" style="height: 36px; border-radius: 8px"></span>
                }
              </div>
            </div>
            <div class="card pad">
              <span class="skeleton line" style="width: 120px; height: 20px"></span>
              <div class="chips-row" style="margin-top: 16px">
                @for (width of chipWidths; track $index) {
                  <span
                    class="skeleton"
                    style="height: 30px; border-radius: 99px"
                    [style.width.px]="width"
                  ></span>
                }
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ExpensesSkeleton {
  readonly view = input.required<SkeletonView>();

  protected readonly categoryWidths = [62, 70, 54, 66, 58, 50];
  protected readonly rowWidths = [58, 70, 44, 64, 52, 68, 46, 60];
  protected readonly chips = [1, 2, 3, 4, 5, 6];
  protected readonly ruleWidths = [150, 112, 132];
  protected readonly fields = [1, 2, 3, 4];
  protected readonly chipWidths = [128, 104, 140, 116, 124, 98, 110, 132];
}
