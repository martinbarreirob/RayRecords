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
import { FormsModule } from '@angular/forms';
import { DEFAULT_TIME_ZONE, todayIn, type Ticket } from '@rayrecords/shared';
import type { Subscription } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { formatCents } from '../../../core/format';
import { DateField } from '../../../core/ui/date-field';
import { PageHeader } from '../../../core/ui/page-header';
import {
  ALL_DATES,
  RANGE_PRESETS,
  TICKETS_LIMIT,
  filterTickets,
  isRangeActive,
  orderedRange,
  presetOf,
  presetRange,
  ticketsTotal,
  toTicketRows,
  unitsLabel,
  type DateRange,
  type RangePreset,
  type TicketRow,
} from './tickets-logic';
import { Icon } from '../../../core/ui/icon';
import { AddButton } from '../../../core/ui/add-button';
import { StockSearchService } from '../../../core/stock-search/stock-search.service';
import { TicketPrinter } from '../../../core/print/ticket-printer';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { PrintSettingsDialog } from './print-settings-dialog';

/**
 * The tickets generated in sales, newest first, with the chosen one opened next to the list as a
 * receipt. `?ticket=<id>` opens a specific one (the sales screen links here after a sale).
 */
@Component({
  selector: 'app-tickets-page',
  imports: [
    Icon,
    FormsModule,
    AddButton,
    PageHeader,
    DateField,
    PrintSettingsDialog,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  host: {
    class: 'page',
    '[class.sheet-open]': 'sheetOpen()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
  styleUrl: './tickets-page.scss',
  template: `
    <app-page-header
      title="Tickets"
      eyebrow="Gestión"
      [hideEyebrowOnMobile]="true"
      [stretchActions]="true"
    >
      <button type="button" class="btn edit-receipt" (click)="settingsOpen.set(true)">
        <app-icon name="pencil" />
        Formato de ticket
      </button>
      <app-add-button label="Nueva venta" (pressed)="stockSearch.show()" />
    </app-page-header>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }

    <div class="toolbar">
      <label class="search">
        <span class="sr-only">Buscar tickets</span>
        <input
          class="input"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Buscar por número o producto…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event ?? '')"
        />
      </label>
      <button
        type="button"
        class="btn filters-toggle"
        aria-controls="tickets-filters"
        [attr.aria-expanded]="filtersOpen()"
        [attr.aria-label]="rangeActive() ? 'Filtros (1 activo)' : 'Filtros'"
        (click)="filtersOpen.set(!filtersOpen())"
      >
        <app-icon name="adjustments-horizontal" />
        <span class="label">Filtros</span>
        @if (rangeActive()) {
          <span class="badge accent">1</span>
        }
        <app-icon class="caret" [name]="!filtersOpen() ? 'chevron-down' : 'chevron-up'" />
      </button>
      @if (rangeActive() || query()) {
        <button type="button" class="btn ghost clear-toolbar" (click)="clearFilters()">
          Quitar filtros
        </button>
      }
      <span class="spacer"></span>
      <span class="shown desk-only muted" aria-live="polite">{{ shownLabel() }}</span>
    </div>

    <section
      id="tickets-filters"
      class="filters"
      aria-label="Filtros de tickets"
      [hidden]="!filtersOpen()"
    >
      <div class="field">
        <span id="tickets-filter-date">Fecha</span>
        <div class="segmented" role="group" aria-labelledby="tickets-filter-date">
          @for (preset of presets; track preset.id) {
            <button
              type="button"
              [attr.aria-pressed]="activePreset() === preset.id"
              (click)="pickPreset(preset.id)"
            >
              {{ preset.label }}
            </button>
          }
        </div>
      </div>
      <div class="field date">
        <label for="tickets-from">Desde</label>
        <app-date-field
          inputId="tickets-from"
          [value]="range().from"
          [max]="today"
          (valueChange)="setRange({ from: $event, to: range().to })"
        />
      </div>
      <div class="field date">
        <label for="tickets-to">Hasta</label>
        <app-date-field
          inputId="tickets-to"
          [value]="range().to"
          [max]="today"
          (valueChange)="setRange({ from: range().from, to: $event })"
        />
      </div>
      @if (rangeActive() || query()) {
        <button type="button" class="btn ghost clear-panel" (click)="clearFilters()">
          Quitar filtros
        </button>
      }
    </section>

    <div class="layout">
      <section class="list" aria-label="Lista de tickets" [attr.aria-busy]="loading()">
        @if (loading() && !rows().length) {
          <p class="sr-only" role="status">Cargando tickets…</p>
          <ul class="ghosts skel-in" aria-hidden="true">
            @for (width of ghostRows; track $index) {
              <li><span class="skeleton line" [style.width.%]="width"></span></li>
            }
          </ul>
        } @else if (visible().length) {
          <table class="table">
            <thead>
              <tr>
                <th scope="col">N.º</th>
                <th scope="col">Fecha</th>
                <th scope="col" class="num c-units">Artículos</th>
                <th scope="col" class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visible(); track row.id) {
                <tr [class.selected]="row.id === selected()?.id" (click)="select(row)">
                  <td>
                    <button
                      type="button"
                      class="open"
                      [attr.aria-pressed]="row.id === selected()?.id"
                      [attr.aria-label]="'Ver el ticket número ' + row.number"
                      (click)="select(row); $event.stopPropagation()"
                    >
                      #{{ row.number }}
                    </button>
                  </td>
                  <td class="c-when">{{ row.when }}</td>
                  <td class="num c-units">{{ row.units }}</td>
                  <td class="num c-total">{{ money(row.totalCents) }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (capped()) {
            <p class="capped muted">Se muestran los {{ limit }} tickets más recientes.</p>
          }
          <p class="summary muted" aria-live="polite">{{ shownLabel() }}</p>
        } @else if (!rows().length && rangeActive()) {
          <p class="empty">
            No hay tickets en esas fechas.
            <button type="button" class="btn sm" (click)="clearFilters()">Quitar filtros</button>
          </p>
        } @else if (!rows().length) {
          <p class="empty">
            Todavía no hay tickets. Se crean en «Ventas» con el botón «Imprimir ticket».
          </p>
        } @else {
          <p class="empty">
            Ningún ticket coincide con la búsqueda.
            <button type="button" class="btn sm" (click)="query.set('')">Quitar búsqueda</button>
          </p>
        }
      </section>

      @if (sheetOpen()) {
        <div class="sheet-backdrop" aria-hidden="true" (click)="closeSheet()"></div>
      }
      <aside
        class="receipt"
        aria-live="polite"
        aria-label="Ticket seleccionado"
        [class.open]="sheetOpen()"
        [attr.inert]="phone() && !sheetOpen() ? '' : null"
      >
        @if (selected(); as ticket) {
          <header class="receipt-head">
            <span class="sheet-grip" aria-hidden="true"></span>
            <h2>Ticket n.º {{ ticket.number }}</h2>
            <span class="muted">{{ ticket.when }}</span>
            <button type="button" class="btn sm print" (click)="printer.print(ticket)">
              <app-icon name="printer" />
              Imprimir
            </button>
            <button
              type="button"
              class="btn ghost icon sm sheet-close"
              aria-label="Cerrar el ticket"
              (click)="closeSheet()"
            >
              <app-icon name="x" />
            </button>
          </header>
          <ul class="lines">
            @for (line of ticket.lines; track line.productId) {
              <li>
                <span class="line-qty num">{{ line.quantity }} ×</span>
                <span class="line-name">
                  {{ line.name }}
                  <small class="muted num">{{ money(line.unitPriceCents) }} / ud.</small>
                </span>
                <span class="line-total num">
                  {{ money(line.quantity * line.unitPriceCents) }}
                </span>
              </li>
            }
          </ul>
          <footer class="receipt-foot">
            <span class="muted">{{ units(ticket.units) }}</span>
            <span class="total">
              Total <strong class="num">{{ money(ticket.totalCents) }}</strong>
            </span>
          </footer>
        } @else if (!loading()) {
          <p class="receipt-empty muted">Elige un ticket de la lista para ver su detalle.</p>
        }
      </aside>
    </div>

    <app-print-settings-dialog [open]="settingsOpen()" (closed)="settingsOpen.set(false)" />
    <p-confirmdialog />
  `,
})
export class TicketsPage {
  protected readonly stockSearch = inject(StockSearchService);
  protected readonly printer = inject(TicketPrinter);
  protected readonly settingsOpen = signal(false);
  private readonly api = inject(ApiClient);

  /** Query parameter: the ticket to open. */
  readonly ticket = input<string>();

  protected readonly money = formatCents;
  protected readonly units = unitsLabel;
  protected readonly limit = TICKETS_LIMIT;
  protected readonly ghostRows = [92, 84, 96, 78, 88, 82];

  private readonly tickets = signal<Ticket[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly presets = RANGE_PRESETS;
  protected readonly today = todayIn(DEFAULT_TIME_ZONE);
  protected readonly range = signal<DateRange>(ALL_DATES);
  protected readonly rangeActive = computed(() => isRangeActive(this.range()));
  protected readonly activePreset = computed(() => presetOf(this.range(), this.today));
  protected readonly filtersOpen = signal(false);
  private request: Subscription | undefined;
  /** Ticket picked by hand; until then the one in the address, or the newest, is shown. */
  private readonly pickedId = signal<string | null>(null);

  protected readonly rows = computed(() => toTicketRows(this.tickets()));
  protected readonly visible = computed(() => filterTickets(this.rows(), this.query()));
  protected readonly capped = computed(() => this.tickets().length >= TICKETS_LIMIT);

  protected readonly selected = computed<TicketRow | undefined>(() => {
    const visible = this.visible();
    const wanted = this.pickedId() ?? this.ticket();
    return visible.find((row) => row.id === wanted) ?? visible[0];
  });

  protected readonly shownLabel = computed(() => {
    if (this.loading() && !this.rows().length) return '';
    const visible = this.visible();
    const noun = visible.length === 1 ? 'ticket' : 'tickets';
    return `${visible.length} ${noun} · ${formatCents(ticketsTotal(visible))}`;
  });

  /** Phone only: the chosen ticket rises from the bottom edge as a sheet. */
  protected readonly sheetOpen = signal(false);
  private deepLinkOpened = false;

  constructor() {
    this.load();
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia('(width <= 767px)');
      const sync = () => {
        this.phone.set(query.matches);
        if (!query.matches) this.sheetOpen.set(false);
      };
      sync();
      query.addEventListener?.('change', sync);
      inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', sync));
    }
    // The sheet shows the ticket that was picked: if that one leaves the list, it closes.
    effect(() => {
      const picked = this.pickedId();
      if (!picked || !this.sheetOpen()) return;
      if (!this.visible().some((row) => row.id === picked))
        untracked(() => this.sheetOpen.set(false));
    });
    // A ticket named in the address (coming from a sale) opens its sheet once.
    effect(() => {
      if (!this.ticket() || !this.visible().length) return;
      untracked(() => {
        if (this.deepLinkOpened || !this.phone()) return;
        this.deepLinkOpened = true;
        this.sheetOpen.set(true);
      });
    });
  }

  /** Follows the window, so the sheet is dropped when it grows past a phone. */
  protected readonly phone = signal(false);

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }

  /** The server filters by date, so the newest-200 cap applies inside the chosen days. */
  private load(): void {
    const { from, to } = this.range();
    this.request?.unsubscribe();
    this.loading.set(true);
    this.request = this.api
      .tickets({ limit: TICKETS_LIMIT, ...(from && { from }), ...(to && { to }) })
      .subscribe({
        next: (tickets) => {
          this.tickets.set(tickets);
          this.error.set('');
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
  }

  /** On a phone the panel folds with Escape or a tap outside it (the date panel is outside the host). */
  protected onEscape(): void {
    if (this.sheetOpen()) this.closeSheet();
    else if (this.phone()) this.filtersOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.filtersOpen() || !this.phone()) return;
    const target = event.target as Element | null;
    if (!target?.isConnected) return;
    if (target.closest('.toolbar, .filters, .rr-date-panel, .p-datepicker')) return;
    this.filtersOpen.set(false);
  }

  protected setRange(range: DateRange): void {
    const next = orderedRange(range);
    const current = this.range();
    if (next.from === current.from && next.to === current.to) return;
    this.range.set(next);
    this.load();
  }

  protected pickPreset(preset: RangePreset): void {
    this.setRange(presetRange(preset, this.today));
  }

  protected clearFilters(): void {
    this.query.set('');
    this.setRange(ALL_DATES);
  }

  protected select(row: TicketRow): void {
    this.pickedId.set(row.id);
    if (this.phone()) this.sheetOpen.set(true);
  }
}
