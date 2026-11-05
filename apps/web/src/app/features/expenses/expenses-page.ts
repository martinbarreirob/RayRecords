import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PrimeNG } from 'primeng/config';
import { catchError, map, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { RefreshBus } from '../../core/refresh';
import { ImportPanel } from './import-panel';
import { FinanceStore } from './finance.store';
import { MovementsPanel } from './movements-panel';
import { useSpanishTexts } from './primeng-es';
import { ReviewPanel } from './review-panel';
import { RulesPanel } from './rules-panel';
import { SummaryPanel } from './summary-panel';

type View = 'review' | 'movements' | 'summary' | 'import' | 'rules';

const VIEWS: readonly { id: View; slug: string; label: string }[] = [
  { id: 'review', slug: 'revisar', label: 'Revisar' },
  { id: 'movements', slug: 'movimientos', label: 'Movimientos' },
  { id: 'summary', slug: 'resumen', label: 'Resumen' },
  { id: 'import', slug: 'importar', label: 'Importar' },
  { id: 'rules', slug: 'reglas', label: 'Reglas' },
];

/** Expenses: movements by category, monthly summary, statement import and rules. */
@Component({
  selector: 'app-expenses-page',
  imports: [SummaryPanel, MovementsPanel, ImportPanel, RulesPanel, ReviewPanel],
  styles: `
    :host {
      display: block;
    }

    .page-header {
      align-items: center;
    }

    .alert {
      margin-bottom: var(--space-4);
    }

    /* The four views fit at 375 px: full width and easy to tap. */
    @media (width <= 767px) {
      .page-header .segmented {
        display: flex;
        width: 100%;
      }

      .page-header .segmented > button {
        flex: 1;
        min-height: var(--touch-target);
        padding: 0 var(--space-2);
      }
    }
  `,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Gastos</h1>
        <div class="segmented" role="group" aria-label="Vista de gastos">
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
      </div>

      @if (store.error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @switch (view()) {
        @case ('review') {
          <app-review-panel />
        }
        @case ('movements') {
          <app-movements-panel />
        }
        @case ('summary') {
          <app-summary-panel />
        }
        @case ('import') {
          <app-import-panel />
        }
        @case ('rules') {
          <app-rules-panel />
        }
      }
    </div>
  `,
})
export class ExpensesPage {
  protected readonly store = inject(FinanceStore);
  protected readonly views = VIEWS;
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
  }

  protected show(slug: string): void {
    void this.router.navigate([], {
      queryParams: { vista: slug === 'movimientos' ? null : slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
