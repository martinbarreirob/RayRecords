import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { DEFAULT_TIME_ZONE, monthOf, todayIn, type MonthlyCategoryTotal } from '@rayrecords/shared';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { RefreshBus } from '../../core/refresh';
import { shiftMonth } from '../calendar/calendar-grid';
import { FinanceStore } from './finance.store';
import { dateOfMonth, type Period } from './movements-logic';
import { PeriodPicker } from './period-picker';
import { buildSummary, clampRange, monthsInRange, share } from './summary-logic';

const WHOLE_EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const MONTH_NARROW = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const MONTH_FULL = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' });

@Component({
  selector: 'app-summary-panel',
  imports: [PeriodPicker],
  styleUrl: './summary-panel.scss',
  template: `
    <div class="controls">
      <div class="field">
        <span id="sum-period">Periodo</span>
        <app-period-picker [period]="period()" (periodChange)="setPeriod($event)" />
      </div>
      <div class="segmented" role="group" aria-label="Tipo de movimiento">
        <button
          type="button"
          [attr.aria-pressed]="type() === 'expense'"
          (click)="type.set('expense')"
        >
          Gastos
        </button>
        <button
          type="button"
          [attr.aria-pressed]="type() === 'income'"
          (click)="type.set('income')"
        >
          Ingresos
        </button>
        <button type="button" [attr.aria-pressed]="type() === 'both'" (click)="type.set('both')">
          Ambos
        </button>
      </div>
    </div>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }

    @if (!loaded()) {
      <div aria-busy="true">
        <p class="sr-only" role="status">Cargando resumen…</p>
        <div class="skel-in" aria-hidden="true">
          <div class="kpis">
            <div class="card kpi">
              <span class="kpi-label"
                >Total {{ type() === 'expense' ? 'gastado' : 'ingresado' }}</span
              >
              <span class="ghost-kpi"><span class="skeleton ghost-kpi-value"></span></span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Media al mes</span>
              <span class="ghost-kpi"><span class="skeleton ghost-kpi-value"></span></span>
            </div>
            <div class="card kpi">
              <span class="kpi-label">Categoría principal</span>
              <span class="ghost-kpi"><span class="skeleton ghost-kpi-value wide"></span></span>
              <span class="ghost-kpi small"><span class="skeleton ghost-kpi-detail"></span></span>
            </div>
          </div>

          <div class="charts">
            <section class="card">
              <h2>Por mes</h2>
              <div class="bars">
                @for (height of ghostBars; track $index) {
                  <div class="bar-col">
                    <span class="bar-track">
                      <span class="skeleton ghost-bar" [style.height.%]="height"></span>
                    </span>
                    <span class="ghost-bar-label"
                      ><span class="skeleton ghost-bar-text"></span
                    ></span>
                  </div>
                }
              </div>
            </section>

            <section class="card">
              <h2>Por categoría</h2>
              <ul class="hbars">
                @for (width of ghostHBars; track $index) {
                  <li class="ghost-hrow">
                    <span class="skeleton ghost-hname"></span>
                    <span class="skeleton ghost-hbar" [style.width.%]="width"></span>
                    <span class="skeleton ghost-hvalue"></span>
                    <span class="skeleton ghost-hshare hbar-share"></span>
                  </li>
                }
              </ul>
            </section>
          </div>

          <section class="card matrix">
            <h2>Detalle por categoría y mes</h2>
            @for (row of ghostBars; track $index) {
              <div class="ghost-trow">
                <span class="skeleton ghost-tname"></span>
                <span class="skeleton ghost-tcell"></span>
                <span class="skeleton ghost-tcell"></span>
                <span class="skeleton ghost-tcell"></span>
              </div>
            }
          </section>
        </div>
      </div>
    } @else if (type() === 'both') {
      <div class="results" [class.is-loading]="loading()" [attr.aria-busy]="loading()">
        <div class="kpis">
          <div class="card kpi">
            <span class="kpi-label">Gastado</span>
            <span class="kpi-value num">{{ money(abs(expenseSummary().grandTotalCents)) }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Ingresado</span>
            <span class="kpi-value num">{{ money(incomeSummary().grandTotalCents) }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Balance</span>
            <span class="kpi-value num" [class.negative]="balanceCents() < 0">
              {{ money(balanceCents()) }}
            </span>
          </div>
        </div>

        <section class="card" aria-labelledby="sum-by-month-both">
          <h2 id="sum-by-month-both">
            Por mes
            <span class="legend muted">
              <span class="swatch"></span> Gastos <span class="swatch income"></span> Ingresos
            </span>
          </h2>
          <div class="bars" [class.dense]="months().length > 8" aria-hidden="true">
            @for (month of months(); track month) {
              <div
                class="bar-col"
                [title]="
                  monthTitle(month) +
                  ': gastos ' +
                  money(abs(expenseSummary().monthTotals[month] ?? 0)) +
                  ', ingresos ' +
                  money(incomeSummary().monthTotals[month] ?? 0)
                "
              >
                <span class="bar-track pair">
                  <span class="bar" [style.height.%]="pairBar('expense', month)"></span>
                  <span class="bar income" [style.height.%]="pairBar('income', month)"></span>
                </span>
                <span class="bar-label">{{ monthShort(month) }}</span>
              </div>
            }
          </div>
        </section>

        <div class="charts">
          <section class="card" aria-labelledby="sum-exp-cat">
            <h2 id="sum-exp-cat">Gastos por categoría</h2>
            <ul class="hbars">
              @for (row of expenseSummary().rows; track row.category) {
                <li>
                  <span class="hbar-name">{{ store.categoryName(row.category) }}</span>
                  <span class="hbar-track" aria-hidden="true">
                    <span class="hbar" [style.width.%]="categoryBar(row.totalCents)"></span>
                  </span>
                  <span class="hbar-value num">{{ money(abs(row.totalCents)) }}</span>
                  <span class="hbar-share muted num"
                    >{{ share(row.totalCents, expenseSummary().grandTotalCents) }} %</span
                  >
                </li>
              } @empty {
                <li class="muted">Sin gastos en este periodo.</li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="sum-inc-cat">
            <h2 id="sum-inc-cat">Ingresos por categoría</h2>
            <ul class="hbars">
              @for (row of incomeSummary().rows; track row.category) {
                <li>
                  <span class="hbar-name">{{ store.categoryName(row.category) }}</span>
                  <span class="hbar-track" aria-hidden="true">
                    <span class="hbar income" [style.width.%]="incomeBar(row.totalCents)"></span>
                  </span>
                  <span class="hbar-value num">{{ money(abs(row.totalCents)) }}</span>
                  <span class="hbar-share muted num"
                    >{{ share(row.totalCents, incomeSummary().grandTotalCents) }} %</span
                  >
                </li>
              } @empty {
                <li class="muted">Sin ingresos en este periodo.</li>
              }
            </ul>
          </section>
        </div>
      </div>
    } @else if (summary().rows.length === 0) {
      <p class="empty" [class.results]="true" [class.is-loading]="loading()">
        No hay {{ type() === 'expense' ? 'gastos' : 'ingresos' }} en este periodo. Prueba con otro
        periodo.
      </p>
    } @else {
      <div class="results" [class.is-loading]="loading()" [attr.aria-busy]="loading()">
        <div class="kpis">
          <div class="card kpi">
            <span class="kpi-label"
              >Total {{ type() === 'expense' ? 'gastado' : 'ingresado' }}</span
            >
            <span class="kpi-value num">{{ money(abs(summary().grandTotalCents)) }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Media al mes</span>
            <span class="kpi-value num">{{ money(abs(summary().monthlyAverageCents)) }}</span>
          </div>
          <div class="card kpi">
            <span class="kpi-label">Categoría principal</span>
            <span class="kpi-value">{{ store.categoryName(summary().rows[0]!.category) }}</span>
            <span class="kpi-detail num">
              {{ money(abs(summary().rows[0]!.totalCents)) }} ·
              {{ share(summary().rows[0]!.totalCents, summary().grandTotalCents) }} %
            </span>
          </div>
        </div>

        <div class="charts">
          <section class="card" aria-labelledby="sum-by-month">
            <h2 id="sum-by-month">Por mes</h2>
            <div class="bars" [class.dense]="summary().months.length > 8" aria-hidden="true">
              @for (month of summary().months; track month) {
                <div
                  class="bar-col"
                  [title]="monthTitle(month) + ': ' + money(abs(summary().monthTotals[month] ?? 0))"
                >
                  <span class="bar-value num">{{
                    wholeEuros(summary().monthTotals[month] ?? 0)
                  }}</span>
                  <span class="bar-track">
                    <span class="bar" [style.height.%]="monthBar(month)"></span>
                  </span>
                  <span class="bar-label">{{ monthShort(month) }}</span>
                </div>
              }
            </div>
          </section>

          <section class="card" aria-labelledby="sum-by-category">
            <h2 id="sum-by-category">Por categoría</h2>
            <ul class="hbars">
              @for (row of summary().rows; track row.category) {
                <li>
                  <span class="hbar-name">{{ store.categoryName(row.category) }}</span>
                  <span class="hbar-track" aria-hidden="true">
                    <span class="hbar" [style.width.%]="categoryBar(row.totalCents)"></span>
                  </span>
                  <span class="hbar-value num">{{ money(abs(row.totalCents)) }}</span>
                  <span class="hbar-share muted num"
                    >{{ share(row.totalCents, summary().grandTotalCents) }} %</span
                  >
                </li>
              }
            </ul>
          </section>
        </div>

        <section class="card matrix" aria-labelledby="sum-detail">
          <h2 id="sum-detail">Detalle por categoría y mes</h2>
          <div class="scroll" tabindex="0" role="region" aria-labelledby="sum-detail">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  @for (month of summary().months; track month) {
                    <th scope="col" class="num">{{ monthShort(month) }}</th>
                  }
                  <th scope="col" class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (row of summary().rows; track row.category) {
                  <tr>
                    <th scope="row">{{ store.categoryName(row.category) }}</th>
                    @for (month of summary().months; track month) {
                      <td class="num" [class.muted]="!row.byMonth[month]">
                        {{ row.byMonth[month] ? money(abs(row.byMonth[month]!)) : '–' }}
                      </td>
                    }
                    <td class="num total">{{ money(abs(row.totalCents)) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  @for (month of summary().months; track month) {
                    <td class="num">{{ money(abs(summary().monthTotals[month] ?? 0)) }}</td>
                  }
                  <td class="num total">{{ money(abs(summary().grandTotalCents)) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    }
  `,
})
export class SummaryPanel {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  protected readonly store = inject(FinanceStore);
  protected readonly money = formatCents;
  protected readonly ghostBars = [46, 70, 58, 88, 64, 80];
  protected readonly ghostHBars = [92, 70, 54, 38, 24];
  protected readonly share = share;
  protected readonly abs = Math.abs;

  private readonly currentMonth = monthOf(todayIn(DEFAULT_TIME_ZONE));
  protected readonly from = signal(shiftMonth(this.currentMonth, -5));
  protected readonly to = signal(this.currentMonth);
  protected readonly type = signal<'expense' | 'income' | 'both'>('expense');
  /** Con «Ambos» son los gastos; con «Ingresos», los ingresos. */
  private readonly rows = signal<MonthlyCategoryTotal[]>([]);
  private readonly incomeRows = signal<MonthlyCategoryTotal[]>([]);
  protected readonly error = signal('');
  /** Ya llegó algún resultado (o error): antes de eso no se puede decir que «no hay datos». */
  protected readonly loaded = signal(false);
  protected readonly loading = signal(true);

  protected readonly period = computed<Period>(() => ({ from: this.from(), to: this.to() }));
  protected readonly months = computed(() => monthsInRange(this.from(), this.to()));

  protected readonly summary = computed(() => buildSummary(this.rows(), this.months()));
  protected readonly expenseSummary = computed(() => buildSummary(this.rows(), this.months()));
  protected readonly incomeSummary = computed(() => buildSummary(this.incomeRows(), this.months()));
  protected readonly balanceCents = computed(
    () => this.expenseSummary().grandTotalCents + this.incomeSummary().grandTotalCents,
  );

  private readonly maxMonth = computed(() =>
    Math.max(1, ...Object.values(this.summary().monthTotals).map(Math.abs)),
  );
  /** Para las barras de «Ambos»: gastos e ingresos comparten escala. */
  private readonly maxPair = computed(() =>
    Math.max(
      1,
      ...Object.values(this.expenseSummary().monthTotals).map(Math.abs),
      ...Object.values(this.incomeSummary().monthTotals).map(Math.abs),
    ),
  );
  private readonly maxIncome = computed(() =>
    Math.max(1, ...this.incomeSummary().rows.map((r) => Math.abs(r.totalCents))),
  );
  private readonly maxCategory = computed(() =>
    Math.max(1, ...this.summary().rows.map((r) => Math.abs(r.totalCents))),
  );

  constructor() {
    effect((onCleanup) => {
      const [from, to, type] = [this.from(), this.to(), this.type()];
      this.bus.version();
      if (!from || !to || from > to) return;
      untracked(() => {
        this.loading.set(true);
        const request =
          type === 'both'
            ? forkJoin({
                expense: this.api.summary({ from, to, type: 'expense' }),
                income: this.api.summary({ from, to, type: 'income' }),
              })
            : this.api
                .summary({ from, to, type })
                .pipe(map((rows) => ({ expense: rows, income: [] as MonthlyCategoryTotal[] })));
        const subscription = request.subscribe({
          next: ({ expense, income }) => {
            this.rows.set(expense);
            this.incomeRows.set(income);
            this.error.set('');
            this.loaded.set(true);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error));
            this.loaded.set(true);
            this.loading.set(false);
          },
        });
        onCleanup(() => subscription.unsubscribe());
      });
    });
  }

  protected setPeriod(period: Period): void {
    if (!period.from) return;
    // Un rango no puede pasar del tope de meses que admite el resumen.
    const [from, to] = clampRange(period.from, period.to ?? period.from);
    this.from.set(from);
    this.to.set(to);
  }

  /** Importe sin céntimos para las etiquetas de las barras, donde falta sitio. */
  protected wholeEuros(cents: number): string {
    return WHOLE_EUROS.format(Math.abs(cents) / 100) + ' €';
  }

  protected monthBar(month: string): number {
    return Math.round((Math.abs(this.summary().monthTotals[month] ?? 0) / this.maxMonth()) * 100);
  }

  protected pairBar(kind: 'expense' | 'income', month: string): number {
    const model = kind === 'expense' ? this.expenseSummary() : this.incomeSummary();
    return Math.round((Math.abs(model.monthTotals[month] ?? 0) / this.maxPair()) * 100);
  }

  protected incomeBar(totalCents: number): number {
    return Math.round((Math.abs(totalCents) / this.maxIncome()) * 100);
  }

  protected categoryBar(totalCents: number): number {
    return Math.round((Math.abs(totalCents) / this.maxCategory()) * 100);
  }

  protected monthShort(month: string): string {
    const text = MONTH_NARROW.format(dateOfMonth(month)).replace('.', '');
    return this.summary().months.length > 12
      ? MONTH_FULL.format(dateOfMonth(month)).replace('.', '')
      : text;
  }

  protected monthTitle(month: string): string {
    return MONTH_FULL.format(dateOfMonth(month)).replace('.', '');
  }
}
