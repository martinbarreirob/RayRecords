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
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .topline .skeleton {
      height: var(--control-height);
      border-radius: var(--radius-control);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      grid-template-areas: 'main side';
      gap: var(--space-4);
      align-items: start;
    }

    .side {
      grid-area: side;
    }

    .main {
      grid-area: main;
    }

    .side-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--space-1);
    }

    /* The three figures above the table: the balance, the expenses and the income. */
    .figures {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .fig {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
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

    .cats {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-2);
    }

    .cats-foot {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-2);
      padding: var(--space-2) var(--space-1) var(--space-1);
      border-top: 1px solid var(--line-soft);
    }

    .cats-foot .skeleton {
      display: block;
      height: var(--control-height);
      border-radius: var(--radius-control);
    }

    .main {
      min-width: 0;
    }

    /* A category: its badge on the left across two lines; name and amount over a thin bar. */
    .cat-row {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      grid-template-areas:
        'icon name amount'
        'icon bar bar';
      align-items: center;
      gap: 3px var(--space-2);
      padding: var(--space-2);
    }

    .cat-row .badge {
      grid-area: icon;
    }

    .cat-row .name {
      grid-area: name;
    }

    .cat-row .amount {
      grid-area: amount;
      width: 56px;
    }

    .cat-row .bar {
      grid-area: bar;
      height: 3px;
      border-radius: var(--radius-pill);
    }

    .tools {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
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

    /* Review: the title, subtitle and progress bar, and the card of the merchant being reviewed. */
    .review {
      display: grid;
      gap: var(--space-4);
      max-width: 640px;
      margin-inline: auto;
    }

    /* Import keeps its reading width, like the real view. */
    .import {
      max-width: 720px;
      margin-inline: auto;
    }

    .review-head {
      display: grid;
      gap: var(--space-2);
    }

    .review-head .title {
      width: 200px;
      height: calc(var(--text-2xl) * 1.2);
    }

    .review-head .sub {
      width: 150px;
      height: calc(var(--text-sm) * 1.5);
    }

    .progress {
      height: 4px;
      border-radius: var(--radius-pill);
    }

    .review-card {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-md);
    }

    .review-card .line {
      height: calc(var(--text-sm) * 1.5);
    }

    .review-card .amount {
      width: 40%;
      height: calc(var(--text-3xl) * 1.1);
    }

    .review-card .merchant {
      width: 60%;
      height: calc(var(--text-xl) * 1.5);
    }

    .review-card .raw {
      height: calc(var(--text-xs) * 1.5);
    }

    .chips {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .chips .skeleton {
      min-height: var(--touch-target);
      border-radius: var(--radius-control);
    }

    .review-card .search {
      min-height: var(--touch-target);
      border-radius: var(--radius-control);
    }

    .review-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid var(--line-soft);
    }

    .review-actions .skeleton {
      height: var(--control-height);
      border-radius: var(--radius-control);
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

    /* Rules: the two buttons, then the categories on the left and the table of rules on the right. */
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .rules-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .rules-actions .skeleton {
      height: var(--control-height);
      border-radius: var(--radius-control);
    }

    .columns {
      display: grid;
      grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
      align-items: start;
      gap: var(--space-4);
    }

    .cats-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .cats-col .cats {
      gap: var(--space-1);
      padding: var(--space-2);
    }

    .plain-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 40px;
      padding: 0 var(--space-2);
    }

    .cats-col .manage {
      height: var(--control-height);
      border-radius: var(--radius-control);
    }

    .rules-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--space-3);
    }

    .rules-head .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--space-2);
    }

    .rule {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 9rem 1rem minmax(0, 11rem) 6.5rem auto auto;
      align-items: center;
      gap: var(--space-3);
      min-height: 48px;
      border-bottom: 1px solid var(--line);
    }

    .rule:last-child {
      border-bottom: 0;
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
        grid-template-columns: minmax(0, 1fr) 260px;
      }
    }

    @media (width <= 1279px) {
      .rule {
        grid-template-columns: minmax(0, 1fr) 8rem 1rem minmax(0, 8rem) 5.5rem auto auto;
        gap: var(--space-2);
      }
    }

    @media (width <= 767px) {
      .layout {
        display: flex;
        flex-direction: column;
      }

      .main {
        display: contents;
      }

      .topline {
        order: -2;
      }

      .figures {
        order: -1;
        grid-template-columns: 1fr;
        margin-bottom: var(--space-3);
      }

      .fig:nth-child(n + 2) {
        display: none;
      }

      .side {
        margin-bottom: var(--space-3);
      }

      .side-head,
      .tools {
        display: none;
      }

      .cats .cat-row:nth-child(n + 4) {
        display: none;
      }

      .columns {
        grid-template-columns: minmax(0, 1fr);
      }

      .rule {
        grid-template-columns: minmax(0, 1fr) auto auto;
      }

      .rule .opt {
        display: none;
      }

      .row {
        grid-template-columns: 24px minmax(0, 1fr) 80px;
      }

      .row .opt {
        display: none;
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
          <div class="layout">
            <div class="main">
              <div class="topline">
                <span class="skeleton" style="width: 200px"></span>
                <span class="skeleton" style="width: 180px"></span>
                <span class="skeleton" style="flex: 1 1 200px"></span>
              </div>
              <div class="figures">
                @for (item of figures; track $index) {
                  <div class="card fig">
                    <span class="skeleton line" style="width: 56px"></span>
                    <span class="skeleton line" style="width: 110px; height: 20px"></span>
                  </div>
                }
              </div>
              <div class="card table">
                <div class="row head">
                  <span class="skeleton line" style="height: 18px; width: 18px"></span>
                  <span class="opt skeleton line" style="width: 40px"></span>
                  <span class="skeleton line" style="width: 90px"></span>
                  <span class="skeleton line" style="width: 60px"></span>
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
            <div class="side">
              <div class="side-head">
                <span class="skeleton line" style="width: 70px; height: 18px"></span>
                <span class="skeleton line" style="width: 90px"></span>
              </div>
              <div class="card cats">
                @for (width of categoryWidths; track $index) {
                  <div class="cat-row">
                    <span class="skeleton badge"></span>
                    <span class="skeleton line name" [style.width.%]="width"></span>
                    <span class="skeleton line amount"></span>
                    <span class="skeleton bar" [style.width.%]="width + 20"></span>
                  </div>
                }
                <div class="cats-foot">
                  <span class="skeleton"></span>
                  <div class="tools">
                    <span class="skeleton"></span>
                    <span class="skeleton"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
        @case ('review') {
          <div class="review">
            <div class="review-head">
              <span class="skeleton line title"></span>
              <span class="skeleton line sub"></span>
              <span class="skeleton progress box"></span>
            </div>
            <div class="card review-card">
              <span class="skeleton line" style="width: 160px"></span>
              <span class="skeleton line amount"></span>
              <span class="skeleton line merchant"></span>
              <span class="skeleton line raw" style="width: 85%"></span>
              <span class="skeleton line" style="width: 70%"></span>
              <div class="chips">
                @for (item of chips; track $index) {
                  <span class="skeleton"></span>
                }
              </div>
              <span class="skeleton line" style="width: 55%"></span>
              <span class="skeleton search box"></span>
              <div class="review-actions">
                <span class="skeleton" style="width: 180px; max-width: 45%"></span>
                <span class="spacer" style="flex: 1"></span>
                <span class="skeleton" style="width: 84px"></span>
                <span class="skeleton" style="width: 96px"></span>
              </div>
            </div>
          </div>
        }
        @case ('import') {
          <div class="card form import">
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
            <div class="rules-actions">
              <span class="skeleton" style="width: 130px"></span>
              <span class="skeleton" style="width: 300px; max-width: 100%"></span>
            </div>
            <div class="columns">
              <div class="cats-col">
                <span class="skeleton line" style="width: 90px; height: 20px"></span>
                <div class="card cats">
                  @for (width of categoryWidths; track $index) {
                    <div class="plain-row">
                      <span class="skeleton badge"></span>
                      <span class="skeleton line" [style.width.%]="width"></span>
                    </div>
                  }
                  <span class="skeleton manage box"></span>
                </div>
              </div>
              <div class="card pad">
                <div class="rules-head">
                  <div class="text">
                    <span class="skeleton line" style="width: 220px; height: 20px"></span>
                    <span class="skeleton line" style="width: 90%"></span>
                    <span class="skeleton line" style="width: 60%"></span>
                  </div>
                  <span class="skeleton line" style="width: 20px"></span>
                </div>
                @for (width of ruleWidths; track $index) {
                  <div class="rule">
                    <span class="skeleton line" [style.width.px]="width"></span>
                    <span class="opt skeleton line" style="width: 76px"></span>
                    <span class="opt"></span>
                    <span class="opt" style="display: flex; align-items: center; gap: 8px">
                      <span class="skeleton badge"></span>
                      <span class="skeleton line" style="width: 70px"></span>
                    </span>
                    <span class="opt skeleton line" style="width: 70px"></span>
                    <span
                      class="skeleton"
                      style="width: 36px; height: 20px; border-radius: 99px"
                    ></span>
                    <span
                      class="skeleton"
                      style="width: 32px; height: 32px; border-radius: 8px"
                    ></span>
                  </div>
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
  protected readonly ruleWidths = [150, 112, 132, 140, 120, 126];
  protected readonly figures = [1, 2, 3];
}
