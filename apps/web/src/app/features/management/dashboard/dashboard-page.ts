import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Dashboard, StockCategory } from '@rayrecords/shared';
import { forkJoin, type Subscription } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { formatCents, formatUnits } from '../../../core/format';
import { PageHeader } from '../../../core/ui/page-header';
import { CategoryBadge } from '../../categories/category-badge';
import { UNCATEGORIZED_LOOK } from '../../categories/uncategorized';
import { formatTicketDate } from '../tickets/tickets-logic';
import {
  stockSlices,
  PERIODS,
  averageTicket,
  axisDays,
  bestDay,
  categoryRows,
  changeLabel,
  dayBars,
  longDay,
  productRows,
  shortDay,
  type DayBar,
} from './dashboard-logic';

/**
 * The management area at a glance: what was sold in the chosen period and how it compares with
 * the one before, the sales day by day, the best sellers, the sales by category, the state of
 * the stock with what to restock, and the last tickets. Everything comes from one request.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, PageHeader, CategoryBadge],
  host: { class: 'page' },
  styleUrls: ['./dashboard-page.scss', './dashboard-charts.scss'],
  template: `
    <app-page-header
      title="Dashboard"
      eyebrow="Gestión"
      [split]="true"
      [hideEyebrowOnMobile]="true"
    >
      <div class="segmented" role="group" aria-label="Periodo">
        @for (period of periods; track period.days) {
          <button
            type="button"
            [attr.aria-pressed]="days() === period.days"
            (click)="setDays(period.days)"
          >
            {{ period.label }}
          </button>
        }
      </div>
    </app-page-header>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }

    @if (data(); as d) {
      <div class="board" [class.is-refreshing]="loading()" [attr.aria-busy]="loading()">
        <!-- Headline figures -->
        <section class="tile">
          <h2>Ventas · {{ days() }} días</h2>
          <p class="figure num">{{ money(d.totals.totalCents) }}</p>
          <p class="detail">{{ change() }}</p>
        </section>
        <section class="tile">
          <h2>Tickets</h2>
          <p class="figure num">{{ count(d.totals.tickets) }}</p>
          <p class="detail">Ticket medio {{ money(average()) }}</p>
        </section>
        <section class="tile">
          <h2>Hoy</h2>
          <p class="figure num">{{ money(d.today.totalCents) }}</p>
          <p class="detail">
            {{ d.today.tickets }} {{ d.today.tickets === 1 ? 'ticket' : 'tickets' }} ·
            {{ count(d.today.units) }} {{ d.today.units === 1 ? 'unidad' : 'unidades' }}
          </p>
        </section>
        <section class="tile">
          <h2>Valor del stock</h2>
          <p class="figure num">{{ money(d.stock.valueCents) }}</p>
          <p class="detail">
            {{ count(d.stock.products) }} productos · {{ count(d.stock.units) }} unidades
          </p>
        </section>

        <!-- Sales day by day -->
        <section class="card daily" aria-labelledby="dash-daily">
          <header class="card-head">
            <h2 id="dash-daily">Ventas por día</h2>
            <p class="readout" aria-hidden="true">
              @if (hovered(); as day) {
                <strong class="num">{{ money(day.totalCents) }}</strong>
                {{ long(day.date) }} · {{ day.tickets }}
                {{ day.tickets === 1 ? 'ticket' : 'tickets' }}
              } @else if (best(); as top) {
                Mejor día: <strong class="num">{{ money(top.totalCents) }}</strong> el
                {{ short(top.date) }}
              }
            </p>
          </header>
          @if (d.totals.tickets) {
            <div class="plot" aria-hidden="true">
              <span class="plot-max num">{{ money(maxDay()) }}</span>
              <div class="bars" [class.hovering]="hovered()" (mouseleave)="hovered.set(null)">
                @for (bar of bars(); track bar.date) {
                  <span
                    class="slot"
                    [class.active]="hovered()?.date === bar.date"
                    (mouseenter)="hovered.set(bar)"
                  >
                    <span class="bar" [style.height.%]="bar.height"></span>
                    @if (hovered()?.date === bar.date) {
                      <span class="tip num" [style.bottom]="'calc(' + bar.height + '% + 6px)'">
                        {{ money(bar.totalCents) }}
                      </span>
                    }
                  </span>
                }
              </div>
              <div class="axis">
                @for (label of axis(); track $index) {
                  <span>{{ label }}</span>
                }
              </div>
            </div>
            <!-- The same figures for whoever cannot see the bars. -->
            <div class="sr-only">
              <table>
                <caption>
                  Ventas de cada día del periodo
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col">Ventas</th>
                    <th scope="col">Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  @for (bar of bars(); track bar.date) {
                    <tr>
                      <th scope="row">{{ long(bar.date) }}</th>
                      <td>{{ money(bar.totalCents) }}</td>
                      <td>{{ bar.tickets }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="none">
              Sin ventas en este periodo.
              <a routerLink="/gestion/ventas">Hacer una venta</a>
            </p>
          }
        </section>

        <!-- Stock of the best sellers -->
        <section class="card stock" aria-labelledby="dash-stock">
          <header class="card-head">
            <h2 id="dash-stock">Stock de los más vendidos</h2>
            <a routerLink="/gestion/stock">Ver stock</a>
          </header>
          @if (d.stock.products) {
            <div class="state-bar" aria-hidden="true">
              @for (slice of slices(); track slice.id) {
                @if (slice.count) {
                  <span [class]="'seg ' + slice.id" [style.flex-grow]="slice.count"></span>
                }
              }
            </div>
            <ul class="legend">
              @for (slice of slices(); track slice.id) {
                <li>
                  <span [class]="'dot ' + slice.id" aria-hidden="true"></span>
                  {{ slice.label }}
                  <strong class="num">{{ slice.count }}</strong>
                </li>
              }
            </ul>
          }
          @if (d.topStock.length) {
            <ul class="stock-rank">
              @for (product of d.topStock; track product.id) {
                <li>
                  <span class="name">{{ product.name }}</span>
                  @if (product.quantity === 0) {
                    <span class="badge danger">Agotado</span>
                  } @else if (product.minQuantity > 0 && product.quantity <= product.minQuantity) {
                    <span class="badge warning">Quedan {{ product.quantity }}</span>
                  } @else {
                    <span class="left num">{{ product.quantity }} en stock</span>
                  }
                </li>
              }
            </ul>
          } @else if (d.stock.products) {
            <p class="none">
              Sin ventas en este periodo.
              <a routerLink="/gestion/ventas">Hacer una venta</a>
            </p>
          } @else {
            <p class="none">
              Todavía no hay productos.
              <a routerLink="/gestion/stock">Añadir productos</a>
            </p>
          }
        </section>

        <!-- Best sellers -->
        <section class="card third top" aria-labelledby="dash-top">
          <header class="card-head">
            <h2 id="dash-top">Más vendidos</h2>
            <span class="muted">unidades</span>
          </header>
          @if (products().length) {
            <ol class="rank">
              @for (row of products(); track row.id) {
                <li>
                  <app-category-badge [look]="row.category ?? uncategorized" />
                  <span class="rank-label">{{ row.label }}</span>
                  <strong class="num">{{ count(row.value) }}</strong>
                  <span class="track" aria-hidden="true">
                    <span class="fill" [style.width.%]="row.width"></span>
                  </span>
                </li>
              }
            </ol>
          } @else {
            <p class="none">Sin ventas en este periodo.</p>
          }
        </section>

        <!-- Sales by category -->
        <section class="card third cats" aria-labelledby="dash-cats">
          <header class="card-head">
            <h2 id="dash-cats">Ventas por categoría</h2>
            <span class="muted">importe</span>
          </header>
          @if (categories().length) {
            <ol class="rank">
              @for (row of categories(); track row.id) {
                <li>
                  <app-category-badge [look]="row.category ?? uncategorized" />
                  <span class="rank-label">{{ row.label }}</span>
                  <strong class="num">{{ money(row.value) }}</strong>
                  <span class="track" aria-hidden="true">
                    <span class="fill" [style.width.%]="row.width"></span>
                  </span>
                </li>
              }
            </ol>
          } @else {
            <p class="none">Sin ventas en este periodo.</p>
          }
        </section>

        <!-- Last tickets -->
        <section class="card third recent-card" aria-labelledby="dash-recent">
          <header class="card-head">
            <h2 id="dash-recent">Últimos tickets</h2>
            <a routerLink="/gestion/tickets">Ver todos</a>
          </header>
          @if (d.recentTickets.length) {
            <table class="table recent" aria-labelledby="dash-recent">
              <tbody>
                @for (ticket of d.recentTickets; track ticket.id) {
                  <tr>
                    <td>
                      <a
                        class="number num"
                        routerLink="/gestion/tickets"
                        [queryParams]="{ ticket: ticket.id }"
                        [attr.aria-label]="'Ver el ticket número ' + ticket.number"
                      >
                        #{{ ticket.number }}
                      </a>
                    </td>
                    <td class="when">{{ when(ticket.createdAt) }}</td>
                    <td class="num c-total">{{ money(ticket.totalCents) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="none">Todavía no hay tickets.</p>
          }
        </section>
      </div>
    } @else if (loading()) {
      <p class="sr-only" role="status">Cargando el dashboard…</p>
      <div class="board skel-in" aria-hidden="true">
        @for (tile of [1, 2, 3, 4]; track tile) {
          <span class="skeleton ghost tile"></span>
        }
        <span class="skeleton ghost daily"></span>
        <span class="skeleton ghost stock"></span>
        @for (card of [1, 2, 3]; track card) {
          <span class="skeleton ghost third"></span>
        }
      </div>
    }
  `,
})
export class DashboardPage {
  private readonly api = inject(ApiClient);

  protected readonly periods = PERIODS;
  protected readonly money = formatCents;
  protected readonly uncategorized = UNCATEGORIZED_LOOK;
  protected readonly short = shortDay;
  protected readonly long = longDay;
  protected readonly when = formatTicketDate;

  protected readonly days = signal(30);
  protected readonly data = signal<Dashboard | null>(null);
  private readonly stockCategories = signal<StockCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** The day under the pointer in the daily chart. */
  protected readonly hovered = signal<DayBar | null>(null);
  private request: Subscription | undefined;

  protected readonly bars = computed(() => dayBars(this.data()?.days ?? []));
  protected readonly axis = computed(() => axisDays(this.data()?.days ?? []));
  protected readonly best = computed(() => bestDay(this.data()?.days ?? []));
  protected readonly maxDay = computed(() => this.best()?.totalCents ?? 0);
  protected readonly products = computed(() =>
    productRows(this.data()?.topProducts ?? [], this.stockCategories()),
  );
  protected readonly categories = computed(() =>
    categoryRows(this.data()?.categories ?? [], this.stockCategories()),
  );
  protected readonly slices = computed(() => {
    const stock = this.data()?.stock;
    return stock ? stockSlices(stock) : [];
  });
  protected readonly average = computed(() => {
    const totals = this.data()?.totals;
    return totals ? averageTicket(totals) : 0;
  });
  protected readonly change = computed(() => {
    const data = this.data();
    if (!data) return '';
    return changeLabel(data.totals.totalCents, data.previous.totalCents, data.days.length);
  });

  constructor() {
    this.load();
  }

  protected count(value: number): string {
    return formatUnits(value);
  }

  protected setDays(days: number): void {
    if (days === this.days()) return;
    this.days.set(days);
    this.load();
  }

  /** The previous figures stay on screen, dimmed, while the new period arrives. */
  private load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.hovered.set(null);
    this.request = forkJoin({
      dashboard: this.api.dashboard(this.days()),
      categories: this.api.stockCategories(),
    }).subscribe({
      next: ({ dashboard, categories }) => {
        this.data.set(dashboard);
        this.stockCategories.set(categories);
        this.error.set('');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }
}
