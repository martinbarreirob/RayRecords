import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Product, ProductSales, StockCategory } from '@rayrecords/shared';
import { forkJoin } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { formatCents } from '../../../core/format';
import { PageHeader } from '../../../core/ui/page-header';
import { pageScrollTop } from '../../../core/ui/page-scroll';
import { ScrollFade } from '../../../core/ui/scroll-fade';
import { CategoryBadge } from '../../categories/category-badge';
import { AllCategoryStore } from '../../categories/all-category';
import { UNCATEGORIZED_LOOK } from '../../categories/uncategorized';
import type { CategoryFilter } from '../stock/stock-logic';
import { AddButton } from '../../../core/ui/add-button';
import { StockSearchService } from '../../../core/stock-search/stock-search.service';
import { CartStore } from './cart.store';
import {
  FEW_TILES,
  bentoTiles,
  cartRows,
  cartTotal,
  categoryTabs,
  quantityInCart,
  stepCategory,
  unitsByProduct,
  type CartRow,
  type TileSize,
} from './sales-logic';
import { Icon } from '../../../core/ui/icon';
import { TicketPrinter } from '../../../core/print/ticket-printer';

/** The phone layout of the sales screen: same breakpoint as the style files. */
const PHONE_QUERY = '(width <= 767px)';
/** Pixels the finger must travel before a press on the cart bar counts as a drag. */
const DRAG_SLOP = 6;
/** Pixels of drag that are enough to open or close the sheet. */
const DRAG_COMMIT = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Point of sale in two columns. Left, three quarters: the products as a bento grid (the best
 * sellers on larger cards) under a category bar with arrows. Right: the cart, filled by dragging a
 * card onto it or with its "Añadir" button, and the button that turns it into a ticket. On a phone
 * the cards are all one size and the cart is a bottom sheet: a bar with the count and the total
 * that opens, by tap or drag, to the lines and the print button.
 */
@Component({
  selector: 'app-sales-page',
  imports: [Icon, RouterLink, AddButton, PageHeader, ScrollFade, CategoryBadge],
  host: {
    class: 'page',
    '[style.--sales-top]': 'top() + "px"',
    '(window:resize)': 'measure()',
  },
  // The cart goes first: the phone rules for it are in the page file and must come later.
  styleUrls: ['./sales-cart.scss', './sales-page.scss'],
  template: `
    <app-page-header
      title="Ventas"
      eyebrow="Gestión"
      [hideEyebrowOnMobile]="true"
      [stretchActions]="true"
    >
      <app-add-button label="Nueva venta" [fillOnMobile]="true" (pressed)="newSale()" />
    </app-page-header>

    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }
    @if (printed(); as last) {
      <p class="alert success" role="status">
        Ticket n.º {{ last.number }} impreso · {{ money(last.totalCents) }}
        <a class="see-ticket" routerLink="/gestion/tickets" [queryParams]="{ ticket: last.id }">
          Ver ticket
        </a>
      </p>
    }

    <div class="layout">
      <section class="catalog" aria-label="Productos">
        <nav class="categories" aria-label="Categorías">
          <div
            #strip
            class="cat-strip"
            role="group"
            aria-label="Elegir categoría"
            (scroll)="measureEdges()"
          >
            @for (tab of tabs(); track tab.id) {
              <button
                type="button"
                class="cat"
                [attr.data-cat]="tab.id"
                [attr.aria-pressed]="category() === tab.id"
                (click)="pick(tab.id)"
              >
                <app-category-badge [look]="tab.look ?? tab.category ?? uncategorized" />
                {{ tab.label }}
              </button>
            }
          </div>
          @if (stripOverflows()) {
            <button
              type="button"
              class="btn icon cat-arrow prev"
              [class.edge-off]="!canScrollBack()"
              aria-label="Categoría anterior"
              (click)="step(-1)"
            >
              <app-icon name="chevron-left" />
            </button>
            <button
              type="button"
              class="btn icon cat-arrow next"
              [class.edge-off]="!canScrollForward()"
              aria-label="Categoría siguiente"
              (click)="step(1)"
            >
              <app-icon name="chevron-right" />
            </button>
          }
        </nav>

        <div class="tiles" appScrollFade [attr.aria-busy]="loading()">
          @if (loading() && !products().length) {
            <p class="sr-only" role="status">Cargando productos…</p>
            <ul class="bento skel-in" aria-hidden="true">
              @for (size of ghostTiles; track $index) {
                <li class="skeleton ghost-tile" [class]="size"></li>
              }
            </ul>
          } @else if (tiles().length) {
            <!-- A new list per category, so each switch plays the enter animation. -->
            @for (key of [category()]; track key) {
              <ul class="bento swap" [class.few]="few()">
                @for (tile of tiles(); track tile.product.id) {
                  @let size = tileSize(tile.size);
                  <li
                    class="tile"
                    [class]="size"
                    [class.out]="tile.product.quantity === 0"
                    [class.dragging]="draggingId() === tile.product.id"
                    [attr.draggable]="canAdd(tile.product) ? 'true' : null"
                    (dragstart)="onDragStart($event, tile.product)"
                    (dragend)="onDragEnd()"
                  >
                    @if (size !== 'normal' || inCart(tile.product.id)) {
                      <span class="tile-top">
                        @if (size !== 'normal') {
                          <span class="badge accent">Más vendido</span>
                        }
                        @if (inCart(tile.product.id); as count) {
                          <span class="badge in-cart">
                            {{ size === 'normal' ? '× ' + count : count + ' en el carrito' }}
                          </span>
                        }
                      </span>
                    }
                    <span class="tile-name">{{ tile.product.name }}</span>
                    <span class="tile-stock">
                      @if (tile.product.quantity === 0) {
                        Agotado
                      } @else {
                        {{ tile.product.quantity }} en stock
                      }
                    </span>
                    <span class="tile-foot">
                      <span class="tile-price num">{{ money(tile.product.priceCents) }}</span>
                      <button
                        type="button"
                        class="btn sm add"
                        [class.icon]="!roomy(size)"
                        [attr.aria-label]="'Añadir ' + tile.product.name + ' al carrito'"
                        [title]="'Añadir al carrito'"
                        [disabled]="!canAdd(tile.product)"
                        (click)="add(tile.product)"
                      >
                        <app-icon name="plus" />
                        @if (roomy(size)) {
                          Añadir
                        }
                      </button>
                    </span>
                  </li>
                }
              </ul>
            }
          } @else if (!products().length) {
            <p class="empty">
              Todavía no hay productos. Añádelos en la sección «Stock» para poder venderlos.
            </p>
          } @else {
            <p class="empty">No hay productos en esta categoría.</p>
          }
        </div>
      </section>

      @if (phone() && sheetOpen()) {
        <div class="sheet-backdrop" aria-hidden="true" (click)="closeSheet()"></div>
      }
      <aside
        #sheet
        class="cart"
        aria-labelledby="cart-title"
        [class.sheet-open]="sheetOpen()"
        [class.sheet-dragging]="dragging()"
        [style.--sheet-drag]="dragOffset() + 'px'"
        [class.drop-ready]="draggingId() !== null"
        [class.drop-over]="over()"
        (keydown.escape)="onEscape()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <header #head class="cart-head">
          <!-- Phone only: the always-visible bar of the bottom sheet. Tap or drag it up to open. -->
          <button
            #toggle
            type="button"
            class="sheet-toggle"
            aria-controls="cart-body"
            [attr.aria-expanded]="sheetOpen()"
            [attr.aria-label]="sheetOpen() ? 'Cerrar el carrito' : 'Abrir el carrito'"
            (click)="onToggleClick()"
            (pointerdown)="onGripDown($event)"
            (pointermove)="onGripMove($event)"
            (pointerup)="onGripUp()"
            (pointercancel)="onGripCancel()"
          >
            <span class="sheet-grip" aria-hidden="true"></span>
            <span class="sheet-summary">
              <app-icon name="shopping-cart" />
              <span class="sheet-title">Carrito</span>
              <span class="sheet-count muted">{{ summary() }}</span>
            </span>
            <strong class="sheet-total num">{{ money(total().totalCents) }}</strong>
            <app-icon [name]="sheetOpen() ? 'chevron-down' : 'chevron-up'" />
          </button>
          <h2 id="cart-title">Carrito</h2>
          @if (rows().length) {
            <span class="muted cart-count">
              {{ total().units }} {{ total().units === 1 ? 'unidad' : 'unidades' }}
            </span>
            <button
              type="button"
              class="btn ghost sm clear"
              aria-label="Vaciar el carrito"
              [disabled]="saving()"
              (click)="cart.clear()"
            >
              Vaciar
            </button>
          }
        </header>

        <div id="cart-body" class="cart-body" [attr.inert]="phone() && !sheetOpen() ? '' : null">
          @if (rows().length) {
            <ul class="lines" appScrollFade>
              @for (row of rows(); track row.productId) {
                <li class="line">
                  <!-- Row 1: what it is on the left, the bin at the far right. -->
                  <div class="line-row">
                    <div class="line-text">
                      <span class="line-name">{{ row.name }}</span>
                      <span class="line-unit muted num">
                        {{ money(row.unitPriceCents) }} / ud.
                        @if (row.quantity >= row.max) {
                          · máx. {{ row.max }}
                        }
                      </span>
                    </div>
                    <button
                      type="button"
                      class="btn ghost icon danger line-remove"
                      [attr.aria-label]="'Quitar ' + row.name + ' del carrito'"
                      (click)="cart.remove(row.productId)"
                    >
                      <app-icon name="trash" />
                    </button>
                  </div>
                  <!-- Row 2: how many on the left, what they add up to on the right. -->
                  <div class="line-row">
                    <span
                      class="stepper"
                      role="group"
                      [attr.aria-label]="'Cantidad de ' + row.name"
                    >
                      <button
                        type="button"
                        class="btn icon"
                        aria-label="Una unidad menos"
                        [disabled]="row.quantity <= 1"
                        (click)="setQuantity(row, row.quantity - 1)"
                      >
                        <app-icon name="minus" />
                      </button>
                      <input
                        #qty
                        class="input num"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        [attr.aria-label]="'Unidades de ' + row.name"
                        [value]="row.quantity"
                        (change)="typeQuantity(row, qty)"
                        (keydown.enter)="qty.blur()"
                      />
                      <button
                        type="button"
                        class="btn icon"
                        aria-label="Una unidad más"
                        [disabled]="row.quantity >= row.max"
                        (click)="setQuantity(row, row.quantity + 1)"
                      >
                        <app-icon name="plus" />
                      </button>
                    </span>
                    <span class="line-total num">{{ money(row.totalCents) }}</span>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="cart-empty">
              <app-icon name="shopping-cart" />
              <span class="desk-only">Arrastra un producto aquí o pulsa «Añadir».</span>
              <span class="phone-only">Pulsa «+» en un producto para añadirlo.</span>
            </p>
          }

          <footer class="cart-foot">
            <div class="cart-total">
              <span>Total</span>
              <strong class="num">{{ money(total().totalCents) }}</strong>
            </div>
            <button
              type="button"
              class="btn primary ticket"
              [disabled]="!rows().length || saving()"
              (click)="generateTicket()"
            >
              {{ saving() ? 'Imprimiendo…' : 'Imprimir ticket' }}
            </button>
          </footer>
        </div>
      </aside>
    </div>
  `,
})
export class SalesPage {
  private readonly api = inject(ApiClient);
  private readonly printer = inject(TicketPrinter);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly cart = inject(CartStore);
  protected readonly stockSearch = inject(StockSearchService);

  protected readonly money = formatCents;
  protected readonly uncategorized = UNCATEGORIZED_LOOK;
  protected readonly ghostTiles = ['xl', 'wide', 'normal', 'normal', 'wide', 'normal', 'normal'];

  /** What the page has above it: the layout fills exactly the rest of the window. */
  protected readonly top = signal(0);

  // Data
  protected readonly products = signal<Product[]>([]);
  private readonly categories = signal<StockCategory[]>([]);
  private readonly sales = signal<ProductSales[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  /** The last ticket printed, until something else is sold: the screen stays on the sale. */
  protected readonly printed = signal<{ id: string; number: number; totalCents: number } | null>(
    null,
  );

  protected readonly category = signal<CategoryFilter>('all');

  // Dragging a card onto the cart
  protected readonly draggingId = signal<string | null>(null);
  protected readonly over = signal(false);

  private readonly allCategory = inject(AllCategoryStore);
  protected readonly tabs = computed(() =>
    categoryTabs(this.categories(), this.products(), this.allCategory.look()),
  );
  protected readonly tiles = computed(() =>
    bentoTiles(this.products(), unitsByProduct(this.sales()), this.category()),
  );
  /** One or two products: they get the room of three columns instead of a lone small card. */
  protected readonly few = computed(() => this.tiles().length <= FEW_TILES);
  protected readonly rows = computed(() => cartRows(this.cart.lines(), this.products()));
  protected readonly total = computed(() => cartTotal(this.rows()));

  /** The categories do not fit on the bar: only then are the arrows shown. */
  protected readonly stripOverflows = signal(false);
  /** There are categories out of sight at the start / the end of the strip (the phone shows one arrow per side). */
  protected readonly canScrollBack = signal(false);
  protected readonly canScrollForward = signal(true);
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  // Phone: the cart is a bottom sheet and every card has the same size.
  protected readonly phone = signal(false);
  protected readonly sheetOpen = signal(false);
  /** While the bar is being dragged: how far the sheet is pulled from where it rests, in pixels. */
  protected readonly dragOffset = signal(0);
  protected readonly dragging = signal(false);
  protected readonly summary = computed(() => {
    const units = this.total().units;
    return units ? `${units} ${units === 1 ? 'artículo' : 'artículos'}` : 'Vacío';
  });
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly head = viewChild<ElementRef<HTMLElement>>('head');
  private readonly toggle = viewChild<ElementRef<HTMLElement>>('toggle');
  private gripStart: { y: number; open: boolean } | null = null;
  private swallowClick = false;

  constructor() {
    this.load();
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(PHONE_QUERY);
      const sync = () => {
        this.phone.set(query.matches);
        if (!query.matches) this.closeSheet();
      };
      sync();
      query.addEventListener?.('change', sync);
      inject(DestroyRef).onDestroy(() => query.removeEventListener?.('change', sync));
    }
    afterNextRender(() => this.measure());
    // The categories arrive, or change, after the first measure.
    afterRenderEffect(() => {
      this.tabs();
      this.measureStrip();
    });
  }

  protected measure(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.top.set(Math.max(0, Math.round(rect.top + pageScrollTop())));
    this.measureStrip();
  }

  /**
   * Compares what the categories need with the whole bar, not with the strip: the strip gets
   * narrower when the arrows appear, and measuring it would make them flicker at the limit.
   */
  private measureStrip(): void {
    const strip = this.strip()?.nativeElement;
    const bar = strip?.parentElement;
    if (!strip || !bar) return;
    this.stripOverflows.set(strip.scrollWidth > bar.clientWidth + 1);
    this.measureEdges();
  }

  /** Which sides of the strip have more categories out of sight. */
  protected measureEdges(): void {
    const strip = this.strip()?.nativeElement;
    if (!strip) return;
    this.canScrollBack.set(strip.scrollLeft > 1);
    this.canScrollForward.set(strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1);
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({
      products: this.api.products(),
      categories: this.api.stockCategories(),
      sales: this.api.topProducts(),
    }).subscribe({
      next: ({ products, categories, sales }) => {
        this.products.set(products);
        this.categories.set(categories);
        this.sales.set(sales);
        if (!this.tabs().some((tab) => tab.id === this.category())) this.category.set('all');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  // Categories

  protected pick(id: CategoryFilter): void {
    this.category.set(id);
    // The chosen category may be outside the visible part of the strip.
    const chip = this.host.nativeElement.querySelector<HTMLElement>(`[data-cat="${id}"]`);
    chip?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }

  protected step(delta: 1 | -1): void {
    this.pick(stepCategory(this.tabs(), this.category(), delta));
  }

  // Cart

  protected inCart(productId: string): number {
    return quantityInCart(this.rows(), productId);
  }

  /** There is stock left beyond what the cart already holds. */
  protected canAdd(product: Product): boolean {
    return product.quantity > this.inCart(product.id);
  }

  /** Alt N: starts looking for what to sell. */
  protected newSale(): void {
    this.printed.set(null);
    this.stockSearch.show();
  }

  /** A card with room for the word "Añadir": a large one, or any when there are few (never on a phone). */
  protected roomy(size: TileSize): boolean {
    return !this.phone() && (size !== 'normal' || this.few());
  }

  /** On a phone every card has the same size, whatever its sales. */
  protected tileSize(size: TileSize): TileSize {
    return this.phone() ? 'normal' : size;
  }

  // Bottom sheet (phone)

  protected closeSheet(returnFocus = false): void {
    this.sheetOpen.set(false);
    if (returnFocus) this.toggle()?.nativeElement.focus();
  }

  protected onEscape(): void {
    if (this.phone() && this.sheetOpen()) this.closeSheet(true);
  }

  protected onToggleClick(): void {
    // A drag ends with a click on the same button: it has already been handled.
    if (this.swallowClick) return;
    this.sheetOpen.update((open) => !open);
  }

  protected onGripDown(event: PointerEvent): void {
    if (!this.phone()) return;
    this.gripStart = { y: event.clientY, open: this.sheetOpen() };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onGripMove(event: PointerEvent): void {
    const start = this.gripStart;
    if (!start) return;
    const delta = event.clientY - start.y;
    if (!this.dragging() && Math.abs(delta) < DRAG_SLOP) return;
    this.dragging.set(true);
    // The sheet can only travel between its two resting places.
    const travel = this.sheetTravel();
    this.dragOffset.set(start.open ? clamp(delta, 0, travel) : clamp(delta, -travel, 0));
  }

  protected onGripUp(): void {
    const start = this.gripStart;
    this.gripStart = null;
    if (!start || !this.dragging()) return;
    const moved = Math.abs(this.dragOffset());
    // Pulled far enough: it goes to the other state; otherwise it springs back.
    if (moved > Math.min(DRAG_COMMIT, this.sheetTravel() / 3)) this.sheetOpen.set(!start.open);
    this.endDrag();
  }

  protected onGripCancel(): void {
    this.gripStart = null;
    this.endDrag();
  }

  private endDrag(): void {
    this.dragging.set(false);
    this.dragOffset.set(0);
    // The click that follows the release comes before any timer.
    this.swallowClick = true;
    setTimeout(() => (this.swallowClick = false));
  }

  /** How far the sheet moves between closed (only the bar) and open. */
  private sheetTravel(): number {
    const sheet = this.sheet()?.nativeElement.offsetHeight ?? 0;
    const bar = this.head()?.nativeElement.offsetHeight ?? 0;
    return Math.max(0, sheet - bar);
  }

  protected add(product: Product): void {
    if (!this.canAdd(product)) return;
    this.printed.set(null);
    this.cart.add(product);
  }

  protected setQuantity(row: CartRow, quantity: number): void {
    this.cart.setQuantity(row.productId, quantity, row.max);
  }

  protected typeQuantity(row: CartRow, input: HTMLInputElement): void {
    this.setQuantity(row, Number(input.value.trim()));
    // The typed text may have been corrected (letters, more than the stock) to the same number.
    input.value = String(this.inCart(row.productId));
  }

  // Drag and drop

  protected onDragStart(event: DragEvent, product: Product): void {
    if (!this.canAdd(product)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', product.name);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    this.draggingId.set(product.id);
  }

  protected onDragEnd(): void {
    this.draggingId.set(null);
    this.over.set(false);
  }

  protected onDragOver(event: DragEvent): void {
    if (this.draggingId() === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.over.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const cart = event.currentTarget as HTMLElement;
    if (!cart.contains(event.relatedTarget as Node | null)) this.over.set(false);
  }

  protected onDrop(event: DragEvent): void {
    const product = this.products().find(({ id }) => id === this.draggingId());
    if (!product) return;
    event.preventDefault();
    this.add(product);
    this.onDragEnd();
  }

  // Ticket

  protected generateTicket(): void {
    const rows = this.rows();
    if (!rows.length || this.saving()) return;
    this.error.set('');
    this.printed.set(null);
    this.saving.set(true);
    this.api
      .createTicket({
        lines: rows.map(({ productId, quantity }) => ({ productId, quantity })),
      })
      .subscribe({
        next: (ticket) => {
          this.saving.set(false);
          this.cart.clear();
          this.closeSheet();
          this.printer.print(ticket);
          this.printed.set({ id: ticket.id, number: ticket.number, totalCents: ticket.totalCents });
          // The units left in the stock changed.
          this.load();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(apiErrorMessage(error));
          // The stock may have changed under the cart: show what is really left.
          this.load();
        },
      });
  }
}
