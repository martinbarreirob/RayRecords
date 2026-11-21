import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { PrimeNG } from 'primeng/config';
import { catchError, map, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { RefreshBus } from '../../core/refresh';
import { PageHeader } from '../../core/ui/page-header';
import { prefersReducedMotion } from '../../core/ui/viewport';
import {
  CategoriesDialog,
  type CategoryOps,
  type CategoryTexts,
  type ManagedCategory,
} from '../categories/categories-dialog';
import { formatNoteDate } from '../notes/note-board.logic';
import { ExpensesSkeleton } from './expenses-skeleton';
import { VIEWS, showView, type View } from './expenses-views';
import { ImportPanel } from './import-panel';
import { FinanceStore } from './finance.store';
import { MovementsPanel } from './movements-panel';
import { useSpanishTexts } from './primeng-es';
import { ReviewPanel } from './review-panel';
import { RulesPanel } from './rules-panel';

/** How long the placeholder shows when switching views (a simulated load, so the change is felt). */
export const VIEW_SWITCH_MS = 300;

/** Expenses: movements with their totals and categories, review, statement import and rules. */
@Component({
  selector: 'app-expenses-page',
  providers: [ConfirmationService],
  imports: [
    CategoriesDialog,
    ConfirmDialogModule,
    ExpensesSkeleton,
    ImportPanel,
    MovementsPanel,
    PageHeader,
    ReviewPanel,
    RulesPanel,
  ],
  styles: `
    :host {
      display: block;
    }

    .alert {
      margin-bottom: var(--space-4);
    }

    /* A view fades in once the placeholder is gone. */
    .view-in {
      animation: view-in 0.3s ease-out;
    }

    @keyframes view-in {
      from {
        opacity: 0;
      }
    }

    .tabs > button {
      position: relative;
    }

    /* The five views fit at 375 px: full width, centred and easy to tap. The pending count
       floats over the corner of «Revisar» so the tab keeps a single line. */
    @media (width <= 767px) {
      /* On a phone the header lays its actions out as items of its own row (split): the views
         take a full row of their own under the title. */
      .tabs {
        display: flex;
        flex: 1 1 100%;
        justify-content: center;
        width: 100%;
      }

      .tabs > button {
        flex: 1;
        min-height: calc(var(--touch-target) - 6px);
        padding: 0 var(--space-1);
        font-size: var(--text-xs);
        white-space: nowrap;
      }

      .tabs .badge {
        position: absolute;
        top: -6px;
        right: -2px;
        padding: 0 5px;
        font-size: 10px;
        line-height: 16px;
      }
    }
  `,
  template: `
    <div class="page">
      <!-- The views sit in the header, on the title's own row: one band less above the content. -->
      <app-page-header title="Gastos" [eyebrow]="today" [split]="true">
        <div class="segmented tabs" role="group" aria-label="Vista de gastos">
          @for (entry of views; track entry.id) {
            <button
              type="button"
              [attr.aria-pressed]="view() === entry.id"
              (click)="show(entry.slug)"
            >
              {{ entry.label }}
              @if (entry.id === 'review' && pending() > 0) {
                <span class="badge warning" [attr.aria-label]="pending() + ' pendientes'">
                  {{ pending() }}
                </span>
              }
            </button>
          }
        </div>
      </app-page-header>

      @if (store.error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @if (switching()) {
        <app-expenses-skeleton [view]="view()" />
      } @else {
        <div class="view-in">
          @switch (view()) {
            @case ('movements') {
              <app-movements-panel />
            }
            @case ('review') {
              <app-review-panel />
            }
            @case ('import') {
              <app-import-panel />
            }
            @case ('rules') {
              <app-rules-panel />
            }
          }
        </div>
      }
    </div>

    <app-categories-dialog
      [open]="store.categoriesOpen()"
      [categories]="managed()"
      [counts]="usage()"
      [ops]="categoryOps"
      [texts]="categoryTexts"
      (changed)="categoriesChanged()"
      (closed)="store.categoriesOpen.set(false)"
    />
    <p-confirmdialog />
  `,
})
export class ExpensesPage {
  protected readonly store = inject(FinanceStore);
  protected readonly views = VIEWS;
  protected readonly today = formatNoteDate(new Date());
  /** True while the placeholder of a view switch is on screen. */
  protected readonly switching = signal(false);
  private switchTimer: ReturnType<typeof setTimeout> | undefined;
  private shownView: View | undefined;
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  /** The categories as the manager takes them (the key is their id). */
  protected readonly managed = computed<ManagedCategory[]>(() =>
    this.store.categories().map(({ key, ...category }) => ({ id: key, ...category })),
  );
  /** Movements per category, loaded each time the manager opens. */
  protected readonly usage = signal<ReadonlyMap<string, number>>(new Map());

  protected readonly categoryOps: CategoryOps = {
    create: (input) =>
      this.api
        .createCategory(input)
        .pipe(map(({ key, ...category }) => ({ id: key, ...category }))),
    update: (id, changes) => this.api.updateCategory(id, changes),
    remove: (id) => this.api.deleteCategory(id),
  };
  protected readonly categoryTexts: CategoryTexts = {
    count: (n) => (n === 0 ? 'sin movimientos' : n === 1 ? '1 movimiento' : `${n} movimientos`),
    deleteEffect: (n) =>
      n === 0
        ? 'No tiene movimientos. Si tiene reglas, tampoco se podrá borrar.'
        : `Tiene ${n} movimientos: no se puede borrar hasta pasarlos a otra categoría.`,
  };

  /** Uncategorised movements, for the counter on the "Revisar" tab. */
  protected readonly pending = toSignal(
    toObservable(this.bus.version).pipe(
      // switchMap drops the previous response when a new refresh arrives.
      switchMap(() =>
        this.api.reviewPending().pipe(catchError(() => of({ pendingTransactions: 0 }))),
      ),
      map((r) => r.pendingTransactions),
    ),
    { initialValue: 0 },
  );

  /** Selected view, kept in the ?vista= query param so it survives reloads and can be linked. */
  readonly vista = input<string | undefined>();
  protected readonly view = computed<View>(
    () => VIEWS.find((entry) => entry.slug === this.vista())?.id ?? 'movements',
  );

  constructor() {
    useSpanishTexts(inject(PrimeNG));

    // The first view shows as soon as it is ready; changing view shows the placeholder first.
    effect(() => {
      const view = this.view();
      untracked(() => {
        if (this.shownView !== undefined && this.shownView !== view) this.simulateLoad();
        this.shownView = view;
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.switchTimer));

    // What each category holds is only asked for while the manager is open.
    effect(() => {
      if (this.store.categoriesOpen()) untracked(() => this.loadUsage());
    });
  }

  private loadUsage(): void {
    this.api.categoryUsage().subscribe({
      next: (usage) => this.usage.set(new Map(Object.entries(usage))),
      error: () => this.usage.set(new Map()),
    });
  }

  /** Every screen shows the categories, so all of them reload. */
  protected categoriesChanged(): void {
    this.store.changed();
    this.loadUsage();
  }

  private simulateLoad(): void {
    clearTimeout(this.switchTimer);
    if (prefersReducedMotion()) {
      this.switching.set(false);
      return;
    }
    this.switching.set(true);
    this.switchTimer = setTimeout(() => this.switching.set(false), VIEW_SWITCH_MS);
  }

  protected show(slug: string): void {
    showView(this.router, slug);
  }
}
