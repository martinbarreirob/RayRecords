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
import { PrimeNG } from 'primeng/config';
import { catchError, map, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { RefreshBus } from '../../core/refresh';
import { PageHeader } from '../../core/ui/page-header';
import { formatNoteDate } from '../notes/note-board.logic';
import { ExpensesSkeleton } from './expenses-skeleton';
import { ImportPanel } from './import-panel';
import { FinanceStore } from './finance.store';
import { MovementsPanel } from './movements-panel';
import { useSpanishTexts } from './primeng-es';
import { ReviewPanel } from './review-panel';
import { RulesPanel } from './rules-panel';
import { SummaryPanel } from './summary-panel';

type View = 'review' | 'movements' | 'summary' | 'import' | 'rules';

/** How long the placeholder shows when switching views (a simulated load, so the change is felt). */
export const VIEW_SWITCH_MS = 500;

const VIEWS: readonly { id: View; slug: string; label: string }[] = [
  { id: 'movements', slug: 'movimientos', label: 'Movimientos' },
  { id: 'summary', slug: 'resumen', label: 'Resumen' },
  { id: 'review', slug: 'revisar', label: 'Revisar' },
  { id: 'import', slug: 'importar', label: 'Importar' },
  { id: 'rules', slug: 'reglas', label: 'Reglas' },
];

/** Expenses: movements by category, monthly summary, statement import and rules. */
@Component({
  selector: 'app-expenses-page',
  imports: [
    ExpensesSkeleton,
    ImportPanel,
    MovementsPanel,
    PageHeader,
    ReviewPanel,
    RulesPanel,
    SummaryPanel,
  ],
  styles: `
    :host {
      display: block;
    }

    .tabs {
      margin-bottom: var(--space-5);
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
        transform: translateY(6px);
      }
    }

    .tabs > button {
      position: relative;
    }

    /* The five views fit at 375 px: full width, centred and easy to tap. The pending count
       floats over the corner of «Revisar» so the tab keeps a single line. */
    @media (width <= 767px) {
      .tabs {
        display: flex;
        justify-content: center;
        width: 100%;
        margin-bottom: var(--space-4);
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
      <app-page-header title="Gastos" [eyebrow]="today" />

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

      @if (store.error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @if (switching()) {
        <app-expenses-skeleton />
      } @else {
        <div class="view-in">
          @switch (view()) {
            @case ('movements') {
              <app-movements-panel />
            }
            @case ('summary') {
              <app-summary-panel />
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
  }

  private simulateLoad(): void {
    clearTimeout(this.switchTimer);
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.switching.set(false);
      return;
    }
    this.switching.set(true);
    this.switchTimer = setTimeout(() => this.switching.set(false), VIEW_SWITCH_MS);
  }

  protected show(slug: string): void {
    void this.router.navigate([], {
      queryParams: { vista: slug === 'movimientos' ? null : slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
