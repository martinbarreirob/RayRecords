import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  DEFAULT_TIME_ZONE,
  type Category,
  monthOf,
  todayIn,
  type Transaction,
  type TransactionQuery,
} from '@rayrecords/shared';
import { PaginatorModule, type PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
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
import { showView } from './expenses-views';
import { PeriodPicker } from './period-picker';
import {
  SORT_CHOICES,
  filterMovements,
  formatDay,
  formatDayHeading,
  groupMovements,
  inPeriod,
  periodTotals,
  sectionTotals,
  singleMonth,
  sumCents,
  toggleExpanded,
  type MovementGroup,
  type MovementRow,
  type Period,
  type SectionFilter,
} from './movements-logic';
import { Icon } from '../../core/ui/icon';
import { injectIsPhone } from '../../core/ui/viewport';
import { DEFAULT_PAGE_SIZE, fitPageSize } from '../../core/ui/page-size';
import { AllCategoryStore } from '../categories/all-category';
import { CategoryLabel } from '../categories/category-label';
import { CategorySelect, type CategoryOption } from '../categories/category-select';
import { MovementDialog } from './movement-dialog';
import { NO_CATEGORY } from '../categories/uncategorized';

/** Size of each API request (its maximum) and cap on movements loaded at once. */
const FETCH_SIZE = 500;
const FETCH_MAX = 10_000;
/** How many category fixes are sent together in one bulk action. */
const BULK_CONCURRENCY = 4;

interface SectionCard {
  id: string;
  key: string | null;
  name: string;
  /** The category itself, for its badge; `null` for "Sin categoría" and for a deleted one. */
  look: Category | null;
  totalCents: number;
  count: number;
}

/** Used until a real row can be measured. */
const ROW_FALLBACK = 45;
/** Height of the page buttons until they can be measured. */
const PAGER_FALLBACK = 52;
/** Slack under the table (card border, gaps) so the page does not scroll by a few pixels. */
const FIT_MARGIN = 8;
/** Height of a day heading until one can be measured. */
const DAY_FALLBACK = 36;
/** The border of the table card, top and bottom. */
const CARD_BORDER = 2;

/** The closest ancestor that scrolls: the page does not scroll with the window but inside it. */
function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return document.documentElement;
}

/** Padding, border and margin that the ancestors of `element` (up to `limit`) leave under it. */
function spaceBelow(element: HTMLElement, limit: HTMLElement): number {
  let total = parseFloat(getComputedStyle(element).marginBottom) || 0;
  for (let node = element.parentElement; node && node !== limit; node = node.parentElement) {
    const style = getComputedStyle(node);
    total +=
      (parseFloat(style.paddingBottom) || 0) +
      (parseFloat(style.borderBottomWidth) || 0) +
      (parseFloat(style.marginBottom) || 0);
  }
  return total + (parseFloat(getComputedStyle(limit).paddingBottom) || 0);
}

@Component({
  selector: 'app-movements-panel',
  imports: [
    CategoryLabel,
    CategorySelect,
    MovementDialog,
    Icon,
    FormsModule,
    TableModule,
    PaginatorModule,
    SelectModule,
    PeriodPicker,
  ],
  styleUrls: ['./movements-panel.scss', './movements-table.scss', './movements-bulk.scss'],
  host: { '[class.day-feed]': 'dayFeed()', '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    <div class="layout">
      <!--
        Right on a desktop: the summary of the period (its movements, totals and categories, which
        also filter the table) with the shortcuts to the other views at its foot.
      -->
      <aside class="side" aria-label="Resumen del periodo">
        <div class="side-head">
          <h2>Resumen</h2>
          <span class="muted num">{{ count(periodRows().length) }}</span>
        </div>
        <section class="card cats" aria-label="Categorías">
          @if (pending()) {
            <div class="sections skel-in" aria-hidden="true">
              @for (row of ghostSections; track $index) {
                <span class="skeleton ghost-section"></span>
              }
            </div>
          } @else {
            <div class="sections" role="group" aria-label="Filtrar por categoría">
              <button
                type="button"
                class="section"
                [class.active]="section() === 'all'"
                [attr.aria-pressed]="section() === 'all'"
                (click)="pick('all')"
              >
                <span class="section-row">
                  <app-category-label
                    class="section-name"
                    size="sm"
                    [look]="allLook()"
                    name="Todas"
                  />
                  <span class="section-total num" [class.positive]="totals().balanceCents > 0">
                    {{ money(totals().balanceCents) }}
                  </span>
                </span>
                <span class="section-bar" aria-hidden="true"><i style="width: 100%"></i></span>
              </button>
              @for (card of sections(); track card.id) {
                <button
                  type="button"
                  class="section"
                  [class.active]="section() === card.id"
                  [attr.aria-pressed]="section() === card.id"
                  (click)="pick(card.id)"
                >
                  <span class="section-row">
                    <app-category-label
                      class="section-name"
                      size="sm"
                      [look]="card.look"
                      [name]="card.name"
                    />
                    @if (card.count) {
                      <span class="section-total num" [class.positive]="card.totalCents > 0">
                        {{ money(card.totalCents) }}
                      </span>
                    } @else {
                      <span class="section-total muted">vacía</span>
                    }
                  </span>
                  <span class="section-bar" aria-hidden="true">
                    <i [style.width.%]="bar(card)"></i>
                  </span>
                </button>
              }
            </div>
          }
          <div class="cats-foot">
            <button
              type="button"
              class="btn categories-btn"
              aria-label="Gestionar las categorías"
              (click)="store.categoriesOpen.set(true)"
            >
              <app-icon name="tag" />
              <span class="categories-label">Categorías</span>
            </button>
            <!-- Importar and Reglas are desktop only: on a phone the tabs of the page lead there. -->
            <div class="side-tools">
              <button type="button" class="btn" (click)="open('importar')">
                <app-icon name="upload" />
                Importar
              </button>
              <button type="button" class="btn" (click)="open('reglas')">
                <app-icon name="adjustments-horizontal" />
                Reglas
              </button>
            </div>
            @if (review().pendingTransactions > 0) {
              <button type="button" class="alert warning review-link" (click)="open('revisar')">
                <span>{{ reviewText() }}</span>
                <strong>Revisar</strong>
              </button>
            }
          </div>
        </section>
      </aside>

      <!-- Right: the movements. -->
      <div class="main">
        <!--
          The period and the group switch on the left, the text filter filling the rest (on a phone the
          options fold under them).
        -->
        <div class="topline">
          <div class="period" role="group" aria-label="Periodo">
            <app-period-picker
              [period]="period()"
              [allowAll]="true"
              (periodChange)="setPeriod($event)"
            />
          </div>
          <button
            type="button"
            class="btn group-toggle"
            aria-label="Agrupar por comercio"
            [attr.aria-pressed]="grouped()"
            (click)="toggleGrouped()"
          >
            <span class="group-icons" aria-hidden="true">
              <app-icon class="icon-off" name="list" />
              <app-icon class="icon-on" name="stack-2" />
            </span>
            <span class="group-toggle-label">Agrupar por comercio</span>
          </button>
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
          <button
            type="button"
            class="btn icon opts-toggle"
            aria-controls="mv-options"
            aria-label="Más opciones"
            [attr.aria-expanded]="options()"
            (click)="options.set(!options())"
          >
            <app-icon name="adjustments-horizontal" />
          </button>
          <div id="mv-options" class="options" [class.open]="options()">
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
        </div>

        <!-- The figures of the period: the balance, and what went out and came in. -->
        <section
          class="figures"
          aria-label="Totales del periodo"
          aria-live="polite"
          [attr.aria-busy]="pending()"
        >
          @if (pending()) {
            <div class="skel-in figures-ghost" aria-hidden="true">
              @for (row of ghostFigures; track $index) {
                <span class="skeleton ghost-figure"></span>
              }
            </div>
          } @else {
            <div class="card fig fig-balance">
              <span class="fig-label">Balance</span>
              <span class="fig-value num" [class.negative]="totals().balanceCents < 0">
                {{ money(totals().balanceCents) }}
              </span>
            </div>
            <div class="card fig fig-expenses">
              <span class="fig-label">Gastos</span>
              <span class="fig-value num">{{ money(totals().expensesCents) }}</span>
            </div>
            <div class="card fig fig-income">
              <span class="fig-label">Ingresos</span>
              <span class="fig-value num positive">{{ money(totals().incomeCents) }}</span>
            </div>
          }
        </section>

        <!-- With a category chosen, its name and how many movements it holds; else only read aloud. -->
        <h2 class="main-title" [class.is-all]="section() === 'all'">
          {{ sectionTitle() }}
          @if (section() !== 'all') {
            <span class="muted">· {{ count(visible().length) }}</span>
          }
        </h2>

        @if (error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }
        @if (notice(); as message) {
          <p class="alert success" role="status">{{ message }}</p>
        }

        <div
          #card
          class="table-card"
          [style.min-height.px]="tableHeight()"
          [class.is-refreshing]="loading() && visible().length > 0"
          [attr.aria-busy]="loading()"
        >
          <p-table
            [value]="tableRows()"
            dataKey="id"
            [selection]="selection()"
            (selectionChange)="selection.set($event)"
            [sortField]="sortField()"
            [sortOrder]="sortOrder()"
            (onSort)="onSort($event)"
            [paginator]="true"
            [rows]="pageSize()"
            [first]="first()"
            [rowHover]="true"
            [rowGroupMode]="dayFeed() ? 'subheader' : undefined"
            groupRowsBy="date"
            styleClass="movements-table"
          >
            <ng-template #header>
              <tr>
                <th class="c-check">
                  @if (!grouped()) {
                    <p-tableheadercheckbox ariaLabel="Seleccionar todos los movimientos" />
                  }
                </th>
                @if (!dayFeed()) {
                  <th class="c-date" pSortableColumn="date">
                    <span class="th-sort">Fecha <p-sorticon field="date" /></span>
                  </th>
                }
                <th class="c-desc" pSortableColumn="description">
                  <span class="th-sort">Descripción <p-sorticon field="description" /></span>
                </th>
                <th class="c-amount num" pSortableColumn="amountCents">
                  <span class="th-sort">Importe <p-sorticon field="amountCents" /></span>
                </th>
                @if (showCategory()) {
                  <th class="c-cat" pSortableColumn="categoryName">
                    <span class="th-sort">Categoría <p-sorticon field="categoryName" /></span>
                  </th>
                }
                <th class="c-edit"><span class="sr-only">Editar</span></th>
              </tr>
            </ng-template>

            <!--
              A group row stands for one place and its movements hang under it when it is open.
              The paginator counts the groups, so an open group is never split across pages.
            -->
            <ng-template #body let-row>
              @if (row.rows; as children) {
                <tr class="mv-row mv-group" (click)="toggleGroup(row.id)">
                  <td class="c-check">
                    <button
                      type="button"
                      class="group-btn"
                      [attr.aria-expanded]="isExpanded(row.id)"
                      [attr.aria-label]="
                        (isExpanded(row.id) ? 'Contraer ' : 'Desplegar ') +
                        row.description +
                        ', ' +
                        row.count +
                        ' movimientos'
                      "
                    >
                      <app-icon [name]="isExpanded(row.id) ? 'chevron-down' : 'chevron-right'" />
                    </button>
                  </td>
                  <td class="c-date"></td>
                  <td class="c-desc" [title]="row.description">
                    <span class="group-name">{{ row.description }}</span>
                    <span class="group-count">{{ row.count }} mov.</span>
                  </td>
                  <td class="c-amount num" [class.positive]="row.amountCents > 0">
                    {{ money(row.amountCents) }}
                  </td>
                  @if (showCategory()) {
                    <td class="c-cat">
                      @if (row.mixed) {
                        <span class="cat cat-none">{{ row.categoryName }}</span>
                      } @else {
                        <span class="cat" [class.cat-none]="row.category === null">
                          <app-category-label
                            size="sm"
                            [look]="row.categoryLook"
                            [name]="row.categoryName"
                          />
                        </span>
                      }
                    </td>
                  }
                  <td class="c-edit"></td>
                </tr>
                @if (isExpanded(row.id)) {
                  @for (child of children; track child.id) {
                    <tr
                      class="mv-row mv-child"
                      [class.row-selected]="isSelected(child.id)"
                      [attr.role]="phone() ? 'button' : null"
                      [attr.tabindex]="phone() ? 0 : null"
                      (click)="onRowTap(child, $event)"
                      (keydown.enter)="onRowTap(child, $event)"
                    >
                      <td class="c-check">
                        <p-tablecheckbox
                          [value]="child"
                          [ariaLabel]="'Seleccionar ' + child.description"
                        />
                      </td>
                      <!--
                        Its date takes the room of the date and the description: the group row
                        already says what it is, so the description only shows when it differs.
                      -->
                      <td class="c-date c-child" colspan="2">
                        <span class="child-day">{{ day(child.date) }}</span>
                        @if (child.description !== row.description) {
                          <span class="child-desc" [title]="child.description">
                            {{ child.description }}
                          </span>
                        }
                      </td>
                      <td class="c-amount num" [class.positive]="child.amountCents > 0">
                        {{ money(child.amountCents) }}
                      </td>
                      @if (showCategory()) {
                        <td class="c-cat">
                          <!-- Always shown: each movement of a place can be moved on its own. -->
                          <span class="cat" [class.cat-none]="child.category === null">
                            <app-category-label
                              size="sm"
                              [look]="child.categoryLook"
                              [name]="child.categoryName"
                            />
                          </span>
                        </td>
                      }
                      <td class="c-edit">
                        <button
                          type="button"
                          class="btn ghost icon"
                          [attr.aria-label]="'Editar el movimiento ' + child.description"
                          (click)="edit(child)"
                        >
                          <app-icon name="pencil" />
                        </button>
                      </td>
                    </tr>
                  }
                }
              } @else {
                <tr
                  class="mv-row"
                  [class.row-selected]="isSelected(row.id)"
                  [attr.role]="phone() ? 'button' : null"
                  [attr.tabindex]="phone() ? 0 : null"
                  (click)="onRowTap(row, $event)"
                  (keydown.enter)="onRowTap(row, $event)"
                >
                  <td class="c-check">
                    <p-tablecheckbox [value]="row" [ariaLabel]="'Seleccionar ' + row.description" />
                  </td>
                  @if (!dayFeed()) {
                    <td class="c-date">{{ day(row.date) }}</td>
                  }
                  <td class="c-desc" [title]="row.description">{{ row.description }}</td>
                  <td class="c-amount num" [class.positive]="row.amountCents > 0">
                    {{ money(row.amountCents) }}
                  </td>
                  @if (showCategory()) {
                    <td class="c-cat">
                      <span class="cat" [class.cat-none]="row.category === null">
                        <app-category-label
                          size="sm"
                          [look]="row.categoryLook"
                          [name]="row.categoryName"
                        />
                      </span>
                    </td>
                  }
                  <td class="c-edit">
                    <button
                      type="button"
                      class="btn ghost icon"
                      [attr.aria-label]="'Editar el movimiento ' + row.description"
                      (click)="edit(row)"
                    >
                      <app-icon name="pencil" />
                    </button>
                  </td>
                </tr>
              }
            </ng-template>

            <!-- Each day opens with its date and what it added up to. -->
            <ng-template #groupheader let-row>
              <tr class="day-row">
                <td [attr.colspan]="columns()">
                  <div class="day-band">
                    <span class="day-name">{{ dayHeading(row.date) }}</span>
                    <span class="day-total num" [class.positive]="dayTotal(row.date) > 0">
                      {{ money(dayTotal(row.date)) }}
                    </span>
                  </div>
                </td>
              </tr>
            </ng-template>

            <ng-template #footer>
              @if (visible().length) {
                <tr class="mv-foot">
                  <td class="f-label" [attr.colspan]="labelSpan()">
                    @if (grouped()) {
                      {{ tableRows().length }}
                      {{ tableRows().length === 1 ? 'lugar' : 'lugares' }} ·
                    }
                    {{ visible().length }}
                    {{ visible().length === 1 ? 'movimiento' : 'movimientos' }} · Total
                    {{ section() === 'all' ? 'visible' : 'sección' }}
                  </td>
                  <td class="c-amount num f-total" [class.positive]="visibleTotal() > 0">
                    {{ money(visibleTotal()) }}
                  </td>
                  <td class="f-end" [attr.colspan]="columns() - labelSpan() - 1"></td>
                </tr>
              }
            </ng-template>

            <ng-template #emptymessage>
              @if (loading()) {
                <tr class="ghost-status">
                  <td [attr.colspan]="columns()">
                    <span class="sr-only" role="status">Cargando movimientos…</span>
                  </td>
                </tr>
                @for (row of ghostRows; track $index) {
                  <tr class="mv-row skel-in" aria-hidden="true">
                    <td class="c-check"><span class="skeleton ghost-box"></span></td>
                    @if (!dayFeed()) {
                      <td class="c-date"><span class="skeleton ghost-date"></span></td>
                    }
                    <td class="c-desc">
                      <span class="skeleton ghost-desc" [style.width.%]="row"></span>
                    </td>
                    <td class="c-amount num"><span class="skeleton ghost-amount"></span></td>
                    @if (showCategory()) {
                      <td class="c-cat">
                        <span class="ghost-cat"><span class="skeleton ghost-pill"></span></span>
                      </td>
                    }
                    <td class="c-edit"><span class="skeleton ghost-edit"></span></td>
                  </tr>
                }
              } @else {
                <tr>
                  <td [attr.colspan]="columns()" class="empty-cell">
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

        <div #pager class="pager">
          <p-paginator
            [first]="first()"
            [rows]="pageSize()"
            [totalRecords]="tableRows().length"
            (onPageChange)="onPage($event)"
          />
        </div>
      </div>
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
        <app-category-select
          class="bulk-select"
          placeholder="Mover a categoría"
          ariaLabel="Mover las seleccionadas a una categoría"
          [options]="categoryOptions()"
          [value]="bulkValue()"
          [disabled]="busy()"
          (valueChange)="bulkAssign($event ?? '')"
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

    <app-movement-dialog
      [movement]="editing()"
      [categories]="store.categories()"
      [accountName]="editingAccount()"
      (saved)="onEdited($event)"
      (closed)="editing.set(null)"
    />
  `,
})
export class MovementsPanel {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  protected readonly store = inject(FinanceStore);

  private readonly router = inject(Router);
  /** The look of "Todas", the one the user picked in the category manager. */
  protected readonly allLook = inject(AllCategoryStore).look;

  protected readonly money = formatCents;
  protected readonly sortChoices = SORT_CHOICES;

  /**
   * What still has no category (movements and places), for the shortcut at the foot of the
   * summary. The queue with a single group is asked for only for its two counters.
   */
  protected readonly review = toSignal(
    toObservable(this.bus.version).pipe(
      switchMap(() =>
        this.api.reviewQueue(1).pipe(
          map(({ pendingTransactions, pendingGroups }) => ({ pendingTransactions, pendingGroups })),
          catchError(() => of({ pendingTransactions: 0, pendingGroups: 0 })),
        ),
      ),
    ),
    { initialValue: { pendingTransactions: 0, pendingGroups: 0 } },
  );
  protected readonly reviewText = computed(() => {
    const { pendingTransactions: n } = this.review();
    return `${n} sin categoría`;
  });
  private readonly currentYear = Number(todayIn(DEFAULT_TIME_ZONE).slice(0, 4));

  // Filters
  protected readonly period = signal<Period>(this.currentMonthPeriod());
  protected readonly section = signal<SectionFilter>('all');
  protected readonly query = signal('');
  /** The movement open in the edit dialog. */
  protected readonly editing = signal<MovementRow | null>(null);
  /** Phone only: sorting stays folded away until asked for. */
  protected readonly options = signal(false);

  // Sorting and paging
  protected readonly sortField = signal<string>('date');
  protected readonly sortOrder = signal<1 | -1>(-1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  /** Height of a full page of the table; `null` where the page just scrolls (a phone). */
  protected readonly tableHeight = signal<number | null>(null);
  private footHeight = 0;
  private rowHeight = ROW_FALLBACK;
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly pager = viewChild<ElementRef<HTMLElement>>('pager');
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
      categoryLook: this.store.category(tx.category),
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

  /** One ghost row per category while the first load is on its way. */
  protected readonly ghostSections = [1, 2, 3, 4, 5, 6];
  protected readonly ghostRows = [72, 54, 66, 48, 78, 60, 70, 52];
  protected readonly ghostFigures = [1, 2, 3];

  protected readonly visibleTotal = computed(() => sumCents(this.visible()));
  /**
   * Group the movements by place: one row per description, open to see each amount. Off from the
   * start: the movements come as a feed, a heading per day.
   */
  protected readonly grouped = signal(false);
  /** Keys of the groups that are open; it does not depend on the data, so it survives reloads. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  /**
   * What the table lists: the movements, or the groups of what is visible (filters apply before
   * grouping). Every place is a group, even with a single movement: its date shows once open.
   */
  protected readonly tableRows = computed<(MovementRow | MovementGroup)[]>(() =>
    this.grouped()
      ? groupMovements(this.visible())
      : this.visible(),
  );
  /** The category is implicit when the list on the left already filters by one. */
  protected readonly showCategory = computed(() => this.section() === 'all');
  /**
   * The feed: movements (not places) by date, with a heading per day. The date is then the heading,
   * not a column; sorting by another column gives the plain table back.
   */
  protected readonly dayFeed = computed(() => !this.grouped() && this.sortField() === 'date');
  /** What each day of the visible movements adds up to (the whole filter, not just the page). */
  private readonly dayTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const row of this.visible()) {
      totals.set(row.date, (totals.get(row.date) ?? 0) + row.amountCents);
    }
    return totals;
  });
  /** Columns of the table: checkbox, [date], description, amount, [category], edit. */
  protected readonly columns = computed(
    () => 4 + (this.dayFeed() ? 0 : 1) + (this.showCategory() ? 1 : 0),
  );
  /** What the totals label spans: the checkbox, the description and the date when it is a column. */
  protected readonly labelSpan = computed(() => (this.dayFeed() ? 2 : 3));
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
        look: category,
        totalCents: total?.totalCents ?? 0,
        count: total?.count ?? 0,
      };
    });
    // Categories that no longer exist but are still on some movement.
    for (const [key, total] of totals) {
      if (key !== null && !known.has(key)) {
        cards.push({
          id: key,
          key,
          name: key,
          look: null,
          totalCents: total.totalCents,
          count: total.count,
        });
      }
    }
    // A category with no movements in the period has nothing to filter: it only stays on screen
    // while it is the chosen one, so the row holds just what there is to look at.
    const active = this.section();
    const none = totals.get(null);
    cards.unshift({
      id: 'none',
      key: null,
      name: NO_CATEGORY,
      look: null,
      totalCents: none?.totalCents ?? 0,
      count: none?.count ?? 0,
    });
    // Largest amount first; "Sin categoría", which is not one of the user's own, goes last.
    const shown = cards.filter((card) => card.count > 0 || card.id === active);
    const byAmount = (a: SectionCard, b: SectionCard) =>
      Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.name.localeCompare(b.name, 'es');
    return [
      ...shown.filter((card) => card.id !== 'none').sort(byAmount),
      ...shown.filter((card) => card.id === 'none'),
    ];
  });

  private readonly maxSection = computed(() =>
    Math.max(1, ...this.sections().map((card) => Math.abs(card.totalCents))),
  );

  protected dayHeading(date: string): string {
    return formatDayHeading(date);
  }

  protected dayTotal(date: string): number {
    return this.dayTotals().get(date) ?? 0;
  }

  protected count(total: number): string {
    return `${total} ${total === 1 ? 'movimiento' : 'movimientos'}`;
  }

  /** The shortcuts at the foot of the summary: Importar, Reglas and Revisar are views of the page. */
  protected open(slug: string): void {
    showView(this.router, slug);
  }

  /** Width of a category's bar: its amount against the largest one. */
  protected bar(card: SectionCard): number {
    return Math.round((Math.abs(card.totalCents) / this.maxSection()) * 100);
  }

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

  /** The entries of the dropdown that moves the selection: "Sin categoría" first, then each one. */
  protected readonly categoryOptions = computed<CategoryOption[]>(() => [
    { value: '', label: NO_CATEGORY, look: null },
    ...this.store.categories().map((c) => ({ value: c.key, label: c.name, look: c })),
  ]);

  protected readonly editingAccount = computed(() => {
    const id = this.editing()?.accountId;
    return this.store.accounts()?.find((account) => account.id === id)?.name ?? '';
  });

  protected readonly sortId = computed(
    () =>
      SORT_CHOICES.find((c) => c.field === this.sortField() && c.order === this.sortOrder())?.id ??
      null,
  );

  private subscription: Subscription | undefined;

  /** Phone: the rows are tapped to edit, and the pencil of each one is not needed. */
  protected readonly phone = injectIsPhone();

  constructor() {
    const destroyRef = inject(DestroyRef);
    // The page size follows the window: as many rows as fit below the top of the table.
    afterNextRender(() => {
      // One measurement per frame while the window is being dragged, not one per resize event.
      let frame = 0;
      const onResize = (): void => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.fit());
      };
      window.addEventListener('resize', onResize);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', onResize);
      });
    });
    effect(() => {
      this.tableRows();
      this.dayFeed();
      // The figures above the table take their final height when the first load ends.
      this.pending();
      untracked(() => queueMicrotask(() => this.fit()));
    });
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

  protected toggleGrouped(): void {
    this.grouped.update((on) => !on);
    this.first.set(0);
  }

  protected isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  protected toggleGroup(key: string): void {
    this.expanded.update((open) => toggleExpanded(open, key));
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

  protected onPage(event: PaginatorState): void {
    this.first.set(event.first ?? 0);
  }

  /**
   * Sets the rows per page to as many as fit between the top of the table and the bottom of the
   * screen (room kept for the header and the page buttons), never under `MIN_PAGE_SIZE`. On a phone
   * the page scrolls, so it is left at the default.
   */
  private fit(): void {
    const card = this.card()?.nativeElement;
    if (!card) return;
    if (this.phone()) {
      this.tableHeight.set(null);
      return;
    }
    const scroller = scrollParent(card);
    const top = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const header = card.querySelector('.p-datatable-thead')?.getBoundingClientRect().height ?? 0;
    // Like the totals row, the height of a row is remembered for when there is no row to measure.
    const rowNow = card.querySelector('tr.mv-row')?.getBoundingClientRect().height;
    if (rowNow) this.rowHeight = rowNow;
    const row = this.rowHeight + this.dayExtra(card);
    const pager = this.pager()?.nativeElement;
    const pagerHeight = pager?.getBoundingClientRect().height || PAGER_FALLBACK;
    // The totals row only exists with movements: its height is remembered for the empty states.
    const footNow = card.querySelector('.p-datatable-tfoot')?.getBoundingClientRect().height;
    if (footNow) this.footHeight = footNow;
    const foot = this.footHeight;
    // Whatever the containers between the pager and the scrolling area add under it.
    const below = pager ? spaceBelow(pager, scroller) : 0;
    const available =
      scroller.clientHeight -
      (top + scroller.scrollTop) -
      header -
      foot -
      pagerHeight -
      below -
      FIT_MARGIN;
    const size = fitPageSize(available, row);
    // The table always takes the room of a full page (its rows, the header, the totals and the
    // border), so with fewer rows the rest stays blank and the page buttons never move.
    this.tableHeight.set(Math.round(header + size * row + foot + CARD_BORDER));
    if (size === this.pageSize()) return;
    this.pageSize.set(size);
    this.first.update((first) => Math.floor(first / size) * size);
  }

  /** What the day headings add to each row on average, so a page of them still fits the window. */
  private dayExtra(card: HTMLElement): number {
    const rows = this.visible().length;
    if (!this.dayFeed() || !rows) return 0;
    const heading =
      card.querySelector('tr.day-row')?.getBoundingClientRect().height || DAY_FALLBACK;
    return (heading * this.dayTotals().size) / rows;
  }

  // Category changes

  /** Phone: a tap on a row (not on its checkbox) opens it to edit. */
  protected onRowTap(row: MovementRow, event: Event): void {
    if (!this.phone()) return;
    if ((event.target as Element).closest('.c-check, button, a')) return;
    this.edit(row);
  }

  protected edit(row: MovementRow): void {
    this.error.set('');
    this.notice.set('');
    this.editing.set(row);
  }

  /** Shows the saved movement at once and tells the other screens (the totals, the review). */
  protected onEdited(updated: Transaction): void {
    this.patchLoaded([updated]);
    this.editing.set(null);
    this.bus.changed();
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
