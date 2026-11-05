import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_TIME_ZONE,
  monthOf,
  todayIn,
  type Transaction,
  type TransactionQuery,
} from '@rayrecords/shared';
import { CheckboxModule } from 'primeng/checkbox';
import { Select, SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import {
  catchError,
  forkJoin,
  map,
  mergeMap,
  of,
  switchMap,
  toArray,
  from,
  type Subscription,
} from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { RefreshBus } from '../../core/refresh';
import { FinanceStore } from './finance.store';
import { PeriodPicker } from './period-picker';
import {
  SORT_CHOICES,
  filterMovements,
  formatDay,
  inPeriod,
  periodLabel,
  periodTotals,
  sectionTotals,
  singleMonth,
  sumCents,
  type MovementRow,
  type Period,
  type SectionFilter,
} from './movements-logic';

/** Size of each API request (its maximum) and cap on movements loaded at once. */
const FETCH_SIZE = 500;
const FETCH_MAX = 10_000;
/** How many category fixes are sent together in one bulk action. */
const BULK_CONCURRENCY = 4;

interface SectionCard {
  id: string;
  key: string | null;
  name: string;
  totalCents: number;
  count: number;
}

@Component({
  selector: 'app-movements-panel',
  imports: [FormsModule, TableModule, SelectModule, CheckboxModule, PeriodPicker],
  styleUrls: ['./movements-panel.scss', './movements-table.scss', './movements-bulk.scss'],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    <div class="topline">
      <div class="period" role="group" aria-label="Periodo">
        <app-period-picker
          [period]="period()"
          [allowAll]="true"
          (periodChange)="setPeriod($event)"
        />
      </div>

      <div class="grand" aria-live="polite" [attr.aria-busy]="pending()">
        <div class="grand-label">Balance · {{ periodText() }}</div>
        @if (pending()) {
          <div class="skel-in" aria-hidden="true">
            <div class="ghost-value"><span class="skeleton ghost-balance"></span></div>
            <div class="ghost-detail"><span class="skeleton ghost-detail-bar"></span></div>
          </div>
        } @else {
          <div class="grand-value num" [class.negative]="totals().balanceCents < 0">
            {{ money(totals().balanceCents) }}
          </div>
          <div class="grand-detail num">
            Gastos {{ money(totals().expensesCents) }} · Ingresos {{ money(totals().incomeCents) }}
          </div>
        }
      </div>
    </div>

    @if (pending()) {
      <div class="sections skel-in" aria-hidden="true">
        @for (width of ghostSections; track $index) {
          <span class="skeleton ghost-section" [style.width.px]="width"></span>
        }
      </div>
    } @else {
      <div class="sections" role="group" aria-label="Secciones por categoría">
        <button
          type="button"
          class="section"
          [class.active]="section() === 'all'"
          [attr.aria-pressed]="section() === 'all'"
          (click)="pick('all')"
        >
          <span class="section-name">Todas</span>
          <span class="section-total num">{{ periodRows().length }} mov.</span>
        </button>
        @for (card of sections(); track card.id) {
          <button
            type="button"
            class="section"
            [class.active]="section() === card.id"
            [class.is-empty]="card.count === 0"
            [attr.aria-pressed]="section() === card.id"
            (click)="pick(card.id)"
          >
            <span class="section-name">{{ card.name }}</span>
            @if (card.count) {
              <span class="section-total num" [class.positive]="card.totalCents > 0">
                {{ money(card.totalCents) }}
              </span>
            } @else {
              <span class="section-total muted">vacía</span>
            }
          </button>
        }
      </div>
    }

    <div class="toolbar">
      <h2>{{ sectionTitle() }}</h2>
      <label class="search">
        <span class="sr-only">Filtrar por descripción</span>
        <input
          class="input"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Filtrar por descripción…"
          [ngModel]="query()"
          (ngModelChange)="setQuery($event)"
        />
      </label>
      <label class="rule-toggle" for="mv-rule">
        <p-checkbox
          [binary]="true"
          inputId="mv-rule"
          [ngModel]="createRule()"
          (ngModelChange)="createRule.set($event)"
        />
        <span>Crear regla al cambiar una categoría</span>
      </label>
      <span class="spacer"></span>
      <p-select
        class="sort-select"
        [options]="sortChoices"
        optionLabel="label"
        optionValue="id"
        [ngModel]="sortId()"
        (ngModelChange)="setSortChoice($event)"
        ariaLabel="Ordenar por"
        appendTo="body"
      />
    </div>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }
    @if (notice(); as message) {
      <p class="alert success" role="status">{{ message }}</p>
    }

    <div
      class="table-card"
      [class.is-refreshing]="loading() && visible().length > 0"
      [attr.aria-busy]="loading()"
    >
      <p-table
        [value]="visible()"
        dataKey="id"
        [selection]="selection()"
        (selectionChange)="selection.set($event)"
        [sortField]="sortField()"
        [sortOrder]="sortOrder()"
        (onSort)="onSort($event)"
        editMode="cell"
        [paginator]="visible().length > pageSize()"
        [rows]="pageSize()"
        [first]="first()"
        (onPage)="onPage($event)"
        [rowsPerPageOptions]="[25, 50, 100]"
        [showCurrentPageReport]="true"
        currentPageReportTemplate="{first}–{last} de {totalRecords}"
        [rowHover]="true"
        styleClass="movements-table"
      >
        <ng-template #header>
          <tr>
            <th class="c-check">
              <p-tableheadercheckbox ariaLabel="Seleccionar todos los movimientos" />
            </th>
            <th class="c-date" pSortableColumn="date">
              <span class="th-sort">Fecha <p-sorticon field="date" /></span>
            </th>
            <th class="c-desc" pSortableColumn="description">
              <span class="th-sort">Descripción <p-sorticon field="description" /></span>
            </th>
            <th class="c-amount num" pSortableColumn="amountCents">
              <span class="th-sort">Importe <p-sorticon field="amountCents" /></span>
            </th>
            <th class="c-cat" pSortableColumn="categoryName">
              <span class="th-sort">Categoría <p-sorticon field="categoryName" /></span>
            </th>
          </tr>
        </ng-template>

        <ng-template #body let-row>
          <tr class="mv-row" [class.row-selected]="isSelected(row.id)">
            <td class="c-check">
              <p-tablecheckbox [value]="row" [ariaLabel]="'Seleccionar ' + row.description" />
            </td>
            <td class="c-date">{{ day(row.date) }}</td>
            <td class="c-desc" [title]="row.description">{{ row.description }}</td>
            <td class="c-amount num" [class.positive]="row.amountCents > 0">
              {{ money(row.amountCents) }}
            </td>
            <td class="c-cat" [pEditableColumn]="row" pEditableColumnField="category">
              <p-celleditor>
                <ng-template #input>
                  <p-select
                    #cs
                    [options]="categoryOptions()"
                    optionLabel="label"
                    optionValue="value"
                    [ngModel]="row.category ?? ''"
                    (onChange)="assign(row, $event.value)"
                    (onFocus)="openOnFocus(cs)"
                    [ariaLabel]="'Categoría de ' + row.description"
                    appendTo="body"
                    [filter]="categoryOptions().length > 8"
                    filterPlaceholder="Buscar categoría"
                    styleClass="cat-select"
                  />
                </ng-template>
                <ng-template #output>
                  <span
                    class="cat"
                    [class.cat-none]="row.category === null"
                    title="Pulsa para cambiar la categoría"
                  >
                    {{ row.categoryName }}
                    @if (row.categorySource === 'manual') {
                      <i class="pi pi-pencil manual" aria-hidden="true"></i>
                      <span class="sr-only">(corregida a mano)</span>
                    }
                    <i class="pi pi-chevron-down caret" aria-hidden="true"></i>
                  </span>
                </ng-template>
              </p-celleditor>
            </td>
          </tr>
        </ng-template>

        <ng-template #footer>
          @if (visible().length) {
            <tr class="mv-foot">
              <td class="f-label" colspan="4">
                {{ visible().length }} {{ visible().length === 1 ? 'movimiento' : 'movimientos' }} ·
                Total {{ section() === 'all' ? 'visible' : 'sección' }}
              </td>
              <td class="c-amount num f-total" [class.positive]="visibleTotal() > 0">
                {{ money(visibleTotal()) }}
              </td>
              <td class="f-end"></td>
            </tr>
          }
        </ng-template>

        <ng-template #emptymessage>
          @if (loading()) {
            <tr class="ghost-status">
              <td colspan="6"><span class="sr-only" role="status">Cargando movimientos…</span></td>
            </tr>
            @for (row of ghostRows; track $index) {
              <tr class="mv-row skel-in" aria-hidden="true">
                <td class="c-check"><span class="skeleton ghost-box"></span></td>
                <td class="c-date"><span class="skeleton ghost-date"></span></td>
                <td class="c-desc">
                  <span class="skeleton ghost-desc" [style.width.%]="row"></span>
                </td>
                <td class="c-acc"><span class="skeleton ghost-acc"></span></td>
                <td class="c-amount num"><span class="skeleton ghost-amount"></span></td>
                <td class="c-cat">
                  <span class="ghost-cat"><span class="skeleton ghost-pill"></span></span>
                </td>
              </tr>
            }
          } @else {
            <tr>
              <td colspan="6" class="empty-cell">
                @if (periodRows().length === 0) {
                  <strong>Sin movimientos en este periodo.</strong>
                  Cambia el periodo o importa un extracto en la pestaña «Importar».
                } @else {
                  <strong>Filtro sin resultados.</strong>
                  {{ noResults() }}
                  <button type="button" class="btn sm" (click)="clearFilters()">
                    Quitar filtros
                  </button>
                }
              </td>
            </tr>
          }
        </ng-template>
      </p-table>
    </div>

    @if (selection().length) {
      <div class="bulk-spacer" aria-hidden="true"></div>
      <div class="bulk" role="region" aria-label="Acciones sobre la selección">
        <span class="bulk-count" aria-live="polite">
          <b
            >{{ selection().length }}
            {{ selection().length === 1 ? 'seleccionada' : 'seleccionadas' }}</b
          >
          · <span class="num">{{ money(selectedTotal()) }}</span>
        </span>
        <p-select
          class="bulk-select"
          [options]="categoryOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="bulkValue()"
          (onChange)="bulkAssign($event.value)"
          [disabled]="busy()"
          placeholder="Mover a categoría"
          ariaLabel="Mover las seleccionadas a una categoría"
          appendTo="body"
          [filter]="categoryOptions().length > 8"
          filterPlaceholder="Buscar categoría"
        />
        <button type="button" class="btn ghost sm bulk-clear" (click)="clearSelection()">
          @if (busy()) {
            Aplicando…
          } @else {
            Quitar <span class="kbd" aria-hidden="true">Esc</span>
          }
        </button>
      </div>
    }
  `,
})
export class MovementsPanel {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  protected readonly store = inject(FinanceStore);

  protected readonly money = formatCents;
  protected readonly sortChoices = SORT_CHOICES;
  private readonly currentYear = Number(todayIn(DEFAULT_TIME_ZONE).slice(0, 4));

  // Filters
  protected readonly period = signal<Period>(this.currentMonthPeriod());
  protected readonly section = signal<SectionFilter>('all');
  protected readonly query = signal('');
  protected readonly createRule = signal(false);

  // Sorting and paging
  protected readonly sortField = signal<string>('date');
  protected readonly sortOrder = signal<1 | -1>(-1);
  protected readonly pageSize = signal(50);
  protected readonly first = signal(0);

  // Data
  private readonly loaded = signal<Transaction[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly selection = signal<MovementRow[]>([]);
  protected readonly busy = signal(false);
  protected readonly bulkValue = signal<string | null>(null);

  private readonly rows = computed<MovementRow[]>(() => {
    return this.loaded().map((tx) => ({
      ...tx,
      categoryName: this.store.categoryName(tx.category),
    }));
  });

  protected readonly periodRows = computed(() => {
    const period = this.period();
    return this.rows().filter((row) => inPeriod(row.month, period));
  });

  protected readonly visible = computed(() =>
    filterMovements(this.periodRows(), this.section(), this.query()),
  );

  /** Nothing to show for the period yet: skeleton instead of zeros or the empty state. */
  protected readonly pending = computed(() => this.loading() && this.periodRows().length === 0);

  protected readonly ghostSections = [120, 148, 134, 126, 140];
  protected readonly ghostRows = [72, 54, 66, 48, 78, 60, 70, 52];

  protected readonly visibleTotal = computed(() => sumCents(this.visible()));
  protected readonly selectedTotal = computed(() => sumCents(this.selection()));
  protected readonly totals = computed(() => periodTotals(this.periodRows()));
  private readonly selectedIds = computed(() => new Set(this.selection().map((row) => row.id)));

  protected readonly sections = computed<SectionCard[]>(() => {
    const totals = sectionTotals(this.periodRows());
    const known = new Set<string>();
    const cards: SectionCard[] = this.store.categories().map((category) => {
      known.add(category.key);
      const total = totals.get(category.key);
      return {
        id: category.key,
        key: category.key,
        name: category.name,
        totalCents: total?.totalCents ?? 0,
        count: total?.count ?? 0,
      };
    });
    // Categories that no longer exist but are still on some movement.
    for (const [key, total] of totals) {
      if (key !== null && !known.has(key)) {
        cards.push({ id: key, key, name: key, totalCents: total.totalCents, count: total.count });
      }
    }
    // Categories with movements first (largest amount first), empty ones last.
    cards.sort(
      (a, b) =>
        Number(b.count > 0) - Number(a.count > 0) ||
        Math.abs(b.totalCents) - Math.abs(a.totalCents) ||
        a.name.localeCompare(b.name, 'es'),
    );
    const none = totals.get(null);
    cards.unshift({
      id: 'none',
      key: null,
      name: 'Sin categoría',
      totalCents: none?.totalCents ?? 0,
      count: none?.count ?? 0,
    });
    return cards;
  });

  protected readonly sectionTitle = computed(() => {
    const section = this.section();
    if (section === 'all') return 'Todos los movimientos';
    return this.sections().find((card) => card.id === section)?.name ?? section;
  });

  protected readonly noResults = computed(() => {
    const query = this.query().trim();
    const parts: string[] = [];
    if (query) parts.push(`con «${query}»`);
    if (this.section() !== 'all') parts.push(`en ${this.sectionTitle()}`);
    return `Ningún movimiento coincide ${parts.join(' ')}.`.replace(' .', '.');
  });

  protected readonly periodText = computed(() => periodLabel(this.period()));

  protected readonly categoryOptions = computed(() => [
    { label: 'Sin categoría', value: '' },
    ...this.store.categories().map((c) => ({ label: c.name, value: c.key })),
  ]);

  protected readonly sortId = computed(
    () =>
      SORT_CHOICES.find((c) => c.field === this.sortField() && c.order === this.sortOrder())?.id ??
      null,
  );

  private subscription: Subscription | undefined;

  constructor() {
    effect(() => {
      const period = this.period();
      this.bus.version();
      untracked(() => this.load(period));
    });
  }

  private currentMonthPeriod(): Period {
    const month = monthOf(todayIn(DEFAULT_TIME_ZONE));
    return { from: month, to: month };
  }

  // Loading

  private load(period: Period): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    const month = singleMonth(period);
    this.subscription = this.fetchAll({ ...(month && { month }) }).subscribe({
      next: (items) => {
        this.loaded.set(items);
        // Movements reload after every change; the selection keeps only those that still exist.
        const byId = new Map(this.rows().map((row) => [row.id, row]));
        this.selection.update((selected) =>
          selected.flatMap((row) => {
            const fresh = byId.get(row.id);
            return fresh ? [fresh] : [];
          }),
        );
        this.error.set('');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** Fetches every page of the query (the API caps requests at 500). */
  private fetchAll(base: Partial<TransactionQuery>) {
    return this.api.transactions({ ...base, limit: FETCH_SIZE, offset: 0 }).pipe(
      switchMap((first) => {
        const rest = [];
        for (
          let offset = FETCH_SIZE;
          offset < Math.min(first.total, FETCH_MAX);
          offset += FETCH_SIZE
        ) {
          rest.push(this.api.transactions({ ...base, limit: FETCH_SIZE, offset }));
        }
        if (!rest.length) return of(first.items);
        return forkJoin(rest).pipe(map((pages) => [first, ...pages].flatMap((p) => p.items)));
      }),
    );
  }

  // Filters

  protected setPeriod(period: Period): void {
    this.period.set(period);
    this.first.set(0);
    this.clearSelection();
  }

  protected setQuery(value: string): void {
    this.query.set(value ?? '');
    this.first.set(0);
  }

  protected pick(section: SectionFilter): void {
    // Clicking the active section shows all of them again.
    this.section.set(this.section() === section ? 'all' : section);
    this.first.set(0);
  }

  protected clearFilters(): void {
    this.section.set('all');
    this.query.set('');
    this.first.set(0);
  }

  // Table

  protected day(date: string): string {
    return formatDay(date, this.currentYear);
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected onSort(event: { field?: string; order?: number }): void {
    if (event.field) this.sortField.set(event.field);
    if (event.order === 1 || event.order === -1) this.sortOrder.set(event.order);
  }

  protected setSortChoice(id: string | null): void {
    const choice = SORT_CHOICES.find((c) => c.id === id);
    if (!choice) return;
    this.sortField.set(choice.field);
    this.sortOrder.set(choice.order);
  }

  protected onPage(event: { first?: number; rows?: number }): void {
    this.first.set(event.first ?? 0);
    if (event.rows) this.pageSize.set(event.rows);
  }

  // Category changes

  protected assign(row: MovementRow, value: string): void {
    const category = value === '' ? null : value;
    if (category === row.category) return;
    this.error.set('');
    this.notice.set('');
    this.api.setCategory(row.id, { category, createRule: this.createRule() }).subscribe({
      next: (updated) => {
        this.patchLoaded([updated]);
        // A new rule can affect other screens (rules, summary), so notify them all.
        this.bus.changed();
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  protected bulkAssign(value: string): void {
    const category = value === '' ? null : value;
    const targets = this.selection().filter((row) => row.category !== category);
    this.bulkValue.set(value);
    if (!targets.length) {
      this.bulkValue.set(null);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    from(targets)
      .pipe(
        mergeMap(
          (row) =>
            this.api.setCategory(row.id, { category, createRule: false }).pipe(
              map((updated) => ({ updated })),
              catchError((error: unknown) => of({ failure: apiErrorMessage(error) })),
            ),
          BULK_CONCURRENCY,
        ),
        toArray(),
      )
      .subscribe((results) => {
        const done = results.flatMap((r) => ('updated' in r ? [r.updated] : []));
        const failures = results.length - done.length;
        this.patchLoaded(done);
        const name = this.store.categoryName(category);
        if (done.length) {
          this.notice.set(
            `${done.length} ${done.length === 1 ? 'movimiento movido' : 'movimientos movidos'} a «${name}».`,
          );
        }
        if (failures) {
          const first = results.find((r) => 'failure' in r);
          this.error.set(
            `No se pudieron cambiar ${failures} movimientos${first && 'failure' in first ? `: ${first.failure}` : ''}.`,
          );
        }
        this.busy.set(false);
        this.bulkValue.set(null);
        this.selection.set([]);
        this.bus.changed();
      });
  }

  /** Shows the corrected movements in the table right away, without waiting for the reload. */
  private patchLoaded(updated: Transaction[]): void {
    if (!updated.length) return;
    const byId = new Map(updated.map((tx) => [tx.id, tx]));
    this.loaded.update((items) => items.map((tx) => byId.get(tx.id) ?? tx));
  }

  /** When editing a category the dropdown opens by itself, so one click on the cell is enough. */
  private readonly autoOpened = new WeakSet<Select>();

  protected openOnFocus(select: Select): void {
    if (this.autoOpened.has(select)) return;
    this.autoOpened.add(select);
    select.show();
  }

  protected clearSelection(): void {
    if (this.busy()) return;
    this.selection.set([]);
  }

  protected onEscape(event: Event): void {
    if (event.defaultPrevented || !this.selection().length) return;
    if (document.querySelector('.p-select-overlay, .p-datepicker-panel')) return;
    this.clearSelection();
  }
}
