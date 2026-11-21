import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Product, StockCategory } from '@rayrecords/shared';
import { ConfirmationService, type MenuItem } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Menu, MenuModule } from 'primeng/menu';
import { PaginatorModule, type PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { forkJoin } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { formatCents, formatUnits } from '../../../core/format';
import { AddButton } from '../../../core/ui/add-button';
import { PageHeader } from '../../../core/ui/page-header';
import { DEFAULT_PAGE_SIZE, fitPageSize } from '../../../core/ui/page-size';
import {
  CategoriesDialog,
  type CategoryOps,
  type CategoryTexts,
} from '../../categories/categories-dialog';
import {
  ALL_CATEGORY_NAME,
  AllCategoryStore,
  allCategoryEntry,
  withAllCategory,
} from '../../categories/all-category';
import { CategoryLabel } from '../../categories/category-label';
import { CategorySelect, type CategoryOption } from '../../categories/category-select';
import { ProductDialog } from './product-dialog';
import { ProductSheet } from './product-sheet';
import type { SheetState } from '../../../core/ui/bottom-sheet';

/** Used until the real heights can be measured (first paint). */
const ROW_FALLBACK = 41;
const CARD_BORDER = 2;
/** Rows per page on a phone, where the page scrolls instead of fitting the window. */
const MOBILE_PAGE_SIZE = 8;
import {
  LEVEL_CHOICES,
  NO_CATEGORY,
  stockTotals,
  activeFilterCount,
  filterProducts,
  productCounts,
  toRows,
  type CategoryFilter,
  type LevelFilter,
  type ProductRow,
} from './stock-logic';
import { Icon } from '../../../core/ui/icon';
import { injectIsPhone } from '../../../core/ui/viewport';

/**
 * The whole stock in one table, with a search box and a folding filter panel. Products are added
 * and edited in a dialog; categories are the user's own and are managed in another one.
 */
@Component({
  selector: 'app-stock-page',
  imports: [
    Icon,
    FormsModule,
    TableModule,
    SelectModule,
    ConfirmDialogModule,
    MenuModule,
    PageHeader,
    AddButton,
    ProductDialog,
    ProductSheet,
    CategoriesDialog,
    CategoryLabel,
    CategorySelect,
    PaginatorModule,
  ],
  providers: [ConfirmationService],
  host: {
    class: 'page',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'filtersOpen.set(false)',
  },
  styleUrl: './stock-page.scss',
  template: `
    <app-page-header title="Stock" eyebrow="Gestión" [hideEyebrowOnMobile]="true">
      <button type="button" class="btn categories-btn" (click)="categoriesOpen.set(true)">
        <app-icon name="tag" />
        Categorías
      </button>
      <app-add-button label="Nuevo producto" (pressed)="openCreate()" />
    </app-page-header>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }

    <div class="toolbar">
      <label class="search">
        <span class="sr-only">Buscar en el stock</span>
        <input
          class="input"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Buscar por nombre, referencia o categoría…"
          [ngModel]="query()"
          (ngModelChange)="setQuery($event)"
        />
      </label>
      <div class="filters-wrap">
        <button
          type="button"
          class="btn filters-toggle"
          aria-label="Filtros"
          aria-controls="stock-filters"
          [attr.aria-expanded]="filtersOpen()"
          (click)="filtersOpen.set(!filtersOpen())"
        >
          <app-icon name="adjustments-horizontal" />
          <span class="label">Filtros</span>
          @if (filterCount(); as count) {
            <span class="badge accent">{{ count }}</span>
          }
          <app-icon class="caret" [name]="!filtersOpen() ? 'chevron-down' : 'chevron-up'" />
        </button>
        <section
          id="stock-filters"
          class="filters"
          aria-label="Filtros del stock"
          [hidden]="!filtersOpen()"
        >
          <div class="field">
            <span id="stock-filter-category">Categoría</span>
            <app-category-select
              [options]="categoryOptions()"
              [value]="category()"
              (valueChange)="setCategory($event)"
              ariaLabelledBy="stock-filter-category"
            />
          </div>
          <div class="field">
            <span id="stock-filter-level">Estado</span>
            <div class="segmented" role="group" aria-labelledby="stock-filter-level">
              @for (choice of levels; track choice.id) {
                <button
                  type="button"
                  [attr.aria-pressed]="level() === choice.id"
                  (click)="setLevel(choice.id)"
                >
                  {{ choice.label }}
                </button>
              }
            </div>
          </div>
          @if (filterCount() || query()) {
            <button type="button" class="btn ghost clear-in-panel" (click)="clearFilters()">
              Quitar filtros
            </button>
          }
        </section>
      </div>
      @if (filterCount() || query()) {
        <button type="button" class="btn ghost clear-toolbar" (click)="clearFilters()">
          Quitar filtros
        </button>
      }
      <span class="spacer"></span>
      <p class="shown muted" aria-live="polite">
        <span>{{ shownLabel() }}</span>
        @if (visible().length) {
          <span class="totals">
            {{ units(totals().units) }} uds. · <strong>{{ money(totals().valueCents) }}</strong>
          </span>
        }
      </p>
    </div>

    <div #area class="table-area">
      <div
        class="table-card"
        [class.is-refreshing]="loading() && rows().length > 0"
        [attr.aria-busy]="loading()"
      >
        <p-table
          [value]="visible()"
          dataKey="id"
          sortField="name"
          [sortOrder]="1"
          [paginator]="true"
          [rows]="pageSize()"
          [(first)]="first"
          [rowHover]="true"
          styleClass="stock-table"
        >
          <ng-template #header>
            <tr>
              <th class="c-name" pSortableColumn="name">
                <span class="th-sort">Producto <p-sorticon field="name" /></span>
              </th>
              <th class="c-cat" pSortableColumn="categoryName">
                <span class="th-sort">Categoría <p-sorticon field="categoryName" /></span>
              </th>
              <th class="c-qty num" pSortableColumn="quantity">
                <span class="th-sort">Cantidad <p-sorticon field="quantity" /></span>
              </th>
              <th class="c-price num" pSortableColumn="priceCents">
                <span class="th-sort">Precio <p-sorticon field="priceCents" /></span>
              </th>
              <th class="c-value num" pSortableColumn="valueCents">
                <span class="th-sort">Valor <p-sorticon field="valueCents" /></span>
              </th>
              <th class="c-actions"><span class="sr-only">Acciones</span></th>
            </tr>
          </ng-template>

          <ng-template #body let-row>
            <tr
              class="st-row"
              [attr.role]="phone() ? 'button' : null"
              [attr.tabindex]="phone() ? 0 : null"
              (click)="onRowClick(row)"
              (keydown.enter)="onRowClick(row)"
            >
              <td class="c-name">
                <span class="name" [title]="row.notes ?? row.name">{{ row.name }}</span>
                @if (row.sku) {
                  <span class="sku">{{ row.sku }}</span>
                }
              </td>
              <td class="c-cat">
                <span class="cat" [class.cat-none]="row.category === null">
                  <app-category-label
                    [look]="row.category"
                    [name]="row.categoryName"
                    [size]="phone() ? 'md' : 'sm'"
                  />
                </span>
              </td>
              <td class="c-qty num">
                @if (row.level === 'out') {
                  <span class="badge danger">Agotado</span>
                } @else if (row.level === 'low') {
                  <span class="badge warning">Bajo</span>
                }
                <span class="qty">{{ units(row.quantity) }}</span>
              </td>
              <td class="c-price num">{{ money(row.priceCents) }}</td>
              <td class="c-value num">{{ money(row.valueCents) }}</td>
              <!-- Phone only: the row is an icon and two lines (name and price; stock and total). -->
              <td class="c-phone">
                <div class="ph-line">
                  <span class="ph-name">{{ row.name }}</span>
                  <span class="ph-price">{{ money(row.priceCents) }}</span>
                </div>
                <div class="ph-line">
                  <span class="ph-qty">
                    {{ units(row.quantity) }}
                    <span class="ph-unit">{{ row.quantity === 1 ? 'unidad' : 'unidades' }}</span>
                  </span>
                  <span class="ph-total">{{ money(row.valueCents) }}</span>
                </div>
              </td>
              <td class="c-actions">
                <button
                  type="button"
                  class="btn ghost icon"
                  aria-haspopup="menu"
                  [attr.aria-label]="'Opciones: ' + row.name"
                  (click)="openMenu($event, row, menu)"
                >
                  <app-icon name="dots" />
                </button>
              </td>
            </tr>
          </ng-template>

          <ng-template #emptymessage>
            @if (loading()) {
              <tr class="ghost-status">
                <td colspan="6"><span class="sr-only" role="status">Cargando el stock…</span></td>
              </tr>
              @for (width of ghostRows; track $index) {
                <tr class="st-row skel-in" aria-hidden="true">
                  <td class="c-name">
                    <span class="skeleton ghost-name" [style.width.%]="width"></span>
                  </td>
                  <td class="c-cat"><span class="skeleton ghost-pill"></span></td>
                  <td class="c-qty num"><span class="skeleton ghost-num"></span></td>
                  <td class="c-price num"><span class="skeleton ghost-num"></span></td>
                  <td class="c-value num"><span class="skeleton ghost-num"></span></td>
                  <td class="c-actions"></td>
                  <td class="c-phone">
                    <span class="skeleton ghost-name" [style.width.%]="width"></span>
                    <span class="skeleton ghost-name" [style.width.%]="width - 20"></span>
                  </td>
                </tr>
              }
            } @else {
              <tr>
                <td colspan="6" class="empty-cell">
                  @if (rows().length === 0) {
                    <strong>Todavía no hay productos.</strong>
                    Añade el primero con «Nuevo producto».
                  } @else {
                    <strong>Ningún producto coincide.</strong>
                    Prueba con otra búsqueda o cambia los filtros.
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
    </div>

    @if (visible().length) {
      <p class="foot muted" aria-live="polite">
        {{ shownLabel() }} · {{ units(totals().units) }} uds. ·
        <strong>{{ money(totals().valueCents) }}</strong>
      </p>
    }

    <div class="pager">
      <p-paginator
        [first]="first()"
        [rows]="pageSize()"
        [totalRecords]="visible().length"
        [pageLinkSize]="phone() ? 3 : 5"
        (onPageChange)="onPage($event)"
      />
    </div>

    <app-product-dialog
      [open]="editorOpen()"
      [product]="editing()"
      [categories]="categories()"
      (saved)="onSaved($event)"
      (closed)="editorOpen.set(false)"
    />
    <app-categories-dialog
      [open]="categoriesOpen()"
      [categories]="managedCategories()"
      [counts]="managedCounts()"
      [ops]="categoryOps"
      [texts]="categoryTexts"
      (changed)="load()"
      (closed)="categoriesOpen.set(false)"
    />
    @if (phone()) {
      <app-product-sheet
        [(state)]="sheetState"
        [row]="sheetRow()"
        [categories]="categories()"
        [resetOn]="sheetKey()"
        (saved)="onSaved($event)"
        (removed)="remove($event)"
      />
    }
    <p-menu #menu [model]="menuItems()" [popup]="true" appendTo="body">
      <ng-template #item let-item>
        <a class="p-menu-item-link" role="menuitem" tabindex="-1">
          <app-icon class="p-menu-item-icon" [name]="$any(item.icon)" />
          <span class="p-menu-item-label">{{ item.label }}</span>
        </a>
      </ng-template>
    </p-menu>
    <p-confirmdialog />
  `,
})
export class StockPage {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);

  /** What the category manager does with the stock categories. */
  private readonly allCategory = inject(AllCategoryStore);
  protected readonly categoryOps: CategoryOps = withAllCategory(
    {
      create: (input) => this.api.createStockCategory(input),
      update: (id, changes) => this.api.updateStockCategory(id, changes),
      remove: (id) => this.api.deleteStockCategory(id),
    },
    this.allCategory,
  );
  protected readonly categoryTexts: CategoryTexts = {
    count: (n) => (n === 0 ? 'sin productos' : n === 1 ? '1 producto' : `${n} productos`),
    deleteEffect: (n) =>
      n === 0
        ? 'No tiene productos.'
        : n === 1
          ? 'Su producto se quedará sin categoría.'
          : `Sus ${n} productos se quedarán sin categoría.`,
  };

  protected readonly money = formatCents;
  protected readonly levels = LEVEL_CHOICES;
  protected readonly totals = computed(() => stockTotals(this.visible()));
  protected readonly shownLabel = computed(() => {
    const total = this.rows().length;
    const shown = this.visible().length;
    const noun = total === 1 ? 'producto' : 'productos';
    return shown === total ? `${total} ${noun}` : `${shown} de ${total} ${noun}`;
  });
  protected readonly ghostRows = [62, 48, 70, 54, 66, 44];

  // Data
  private readonly products = signal<Product[]>([]);
  protected readonly categories = signal<StockCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  // Search and filters
  protected readonly query = signal('');
  protected readonly category = signal<CategoryFilter>('all');
  protected readonly level = signal<LevelFilter>('all');
  protected readonly filtersOpen = signal(false);

  // Paging
  /** Rows per page: as many as fit the window (see `fit`), so the screen never scrolls. */
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  private readonly area = viewChild<ElementRef<HTMLElement>>('area');
  protected readonly first = signal(0);

  // Dialogs
  protected readonly editorOpen = signal(false);
  /** Phone: the product sheet replaces the dialog and the row menu. */
  protected readonly phone = injectIsPhone();
  protected readonly sheetState = signal<SheetState>('closed');
  private readonly sheetId = signal<string | null>(null);
  /** Counts the openings of the sheet, so its form starts over each time. */
  protected readonly sheetKey = signal(0);
  protected readonly sheetRow = computed(
    () => this.rows().find(({ id }) => id === this.sheetId()) ?? null,
  );
  protected readonly editing = signal<Product | null>(null);
  protected readonly categoriesOpen = signal(false);

  protected readonly rows = computed(() => toRows(this.products(), this.categories()));
  private readonly filters = computed(() => ({
    query: this.query(),
    category: this.category(),
    level: this.level(),
  }));
  protected readonly visible = computed(() => filterProducts(this.rows(), this.filters()));
  protected readonly counts = computed(() => productCounts(this.products()));
  protected readonly filterCount = computed(() => activeFilterCount(this.filters()));

  /** "Todas" first, with the look the user gave it, then the stock categories. */
  protected readonly managedCategories = computed(() => [
    allCategoryEntry(this.allCategory.look()),
    ...this.categories(),
  ]);
  protected readonly managedCounts = computed(
    () => new Map([...this.counts(), ['all', this.products().length]]),
  );

  protected readonly categoryOptions = computed<CategoryOption[]>(() => [
    { value: 'all', label: ALL_CATEGORY_NAME, look: this.allCategory.look() },
    { value: 'none', label: NO_CATEGORY, look: null },
    ...this.categories().map((category) => ({
      value: category.id,
      label: category.name,
      look: category,
    })),
  ]);

  constructor() {
    this.load();
    // Leaving the phone layout drops the sheet.
    effect(() => {
      if (!this.phone()) untracked(() => this.sheetState.set('closed'));
    });
    // The page size follows the window and what the table holds (rows and the room they have).
    const injector = inject(Injector);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const area = this.area()?.nativeElement;
      if (!area || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.fit());
      observer.observe(area);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    effect(() => {
      this.visible();
      this.loading();
      afterNextRender(() => this.fit(), { injector });
    });
    // "Añadir un producto al stock" from the stock search arrives as ?nuevo=1: open the form once.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const search = params.get('buscar');
      if (!params.has('nuevo') && search === null) return;
      if (params.has('nuevo')) this.openCreate();
      // A product picked in the command palette arrives as ?buscar=<name>: fill the search box.
      if (search !== null) this.setQuery(search);
      void this.router.navigate([], {
        queryParams: { nuevo: null, buscar: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  /**
   * Sets the rows per page to as many as fit in the space the table area has: its height minus the
   * header row, over the height of a row (never under `MIN_PAGE_SIZE`). The card then takes the
   * height of its rows, so with fewer products than fit it is just shorter. On a phone the page
   * scrolls, so a fixed `MOBILE_PAGE_SIZE` is used.
   */
  private fit(): void {
    const area = this.area()?.nativeElement;
    if (!area) return;
    // Phones let the page scroll; only the desktop table is fitted to the window.
    if (this.phone()) return this.setPageSize(MOBILE_PAGE_SIZE);
    const height = (selector: string): number =>
      area.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    const available = area.clientHeight - height('.p-datatable-thead') - CARD_BORDER;
    const size = fitPageSize(available, height('tr.st-row') || ROW_FALLBACK);
    this.setPageSize(size);
  }

  private setPageSize(size: number): void {
    if (size === this.pageSize()) return;
    this.pageSize.set(size);
    // Stay on the page that holds the first row now on screen.
    this.first.update((first) => Math.floor(first / size) * size);
  }

  /** Filters are a popover: a click anywhere else (not on its select's list either) closes it. */
  protected onDocumentClick(event: Event): void {
    if (!this.filtersOpen()) return;
    const inside = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element && node.matches('.filters-wrap, .p-select-overlay, .p-overlay'),
      );
    if (!inside) this.filtersOpen.set(false);
  }

  protected load(): void {
    this.loading.set(true);
    forkJoin({ products: this.api.products(), categories: this.api.stockCategories() }).subscribe({
      next: ({ products, categories }) => {
        this.products.set(products);
        this.categories.set(categories);
        // A filter on a category that is gone would hide everything with no way to see why.
        const category = this.category();
        if (
          category !== 'all' &&
          category !== 'none' &&
          !categories.some(({ id }) => id === category)
        ) {
          this.category.set('all');
        }
        this.error.set('');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected units(value: number): string {
    return formatUnits(value);
  }

  // Search and filters

  protected setQuery(value: string): void {
    this.query.set(value ?? '');
    this.first.set(0);
  }

  protected setCategory(value: CategoryFilter | null): void {
    this.category.set(value ?? 'all');
    this.first.set(0);
  }

  protected setLevel(value: LevelFilter): void {
    this.level.set(value);
    this.first.set(0);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.category.set('all');
    this.level.set('all');
    this.first.set(0);
  }

  protected onPage(event: PaginatorState): void {
    this.first.set(event.first ?? 0);
  }

  // Products

  protected openCreate(): void {
    if (this.editorOpen() || this.categoriesOpen()) return;
    if (this.phone()) {
      this.sheetId.set(null);
      this.sheetKey.update((key) => key + 1);
      this.sheetState.set('expanded');
      return;
    }
    this.editing.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(row: ProductRow): void {
    this.editing.set(this.products().find((product) => product.id === row.id) ?? null);
    this.editorOpen.set(true);
  }

  /** Phone: a tap on a row shows its product in the sheet. */
  protected onRowClick(row: ProductRow): void {
    if (!this.phone()) return;
    this.sheetId.set(row.id);
    this.sheetKey.update((key) => key + 1);
    this.sheetState.set('peek');
  }

  /** Shows the saved product at once, without waiting for a reload. */
  protected onSaved(saved: Product): void {
    this.products.update((products) =>
      products.some((product) => product.id === saved.id)
        ? products.map((product) => (product.id === saved.id ? saved : product))
        : [...products, saved],
    );
    this.editorOpen.set(false);
    // Phone: an edited product goes back to its summary; a new one just closes the sheet.
    if (this.phone()) {
      if (this.sheetId() === saved.id) this.sheetState.set('peek');
      else this.sheetState.set('closed');
    }
  }

  /** What the options menu of a row offers; set when it opens, for the row it opens on. */
  protected readonly menuItems = signal<MenuItem[]>([]);

  protected openMenu(event: Event, row: ProductRow, menu: Menu): void {
    this.menuItems.set([
      { label: 'Editar', icon: 'pencil', command: () => this.openEdit(row) },
      {
        label: 'Eliminar',
        icon: 'trash',
        styleClass: 'menu-danger',
        command: () => this.remove(row),
      },
    ]);
    menu.toggle(event);
  }

  protected remove(row: ProductRow): void {
    this.confirmation.confirm({
      header: 'Borrar producto',
      message: `¿Borrar «${row.name}» del stock? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Borrar',
      rejectLabel: 'Cancelar',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () =>
        this.api.deleteProduct(row.id).subscribe({
          next: () => {
            this.products.update((products) => products.filter(({ id }) => id !== row.id));
            if (this.sheetId() === row.id) this.sheetState.set('closed');
            this.error.set('');
          },
          error: (error: unknown) => this.error.set(apiErrorMessage(error)),
        }),
    });
  }
}
