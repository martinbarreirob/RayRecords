import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { Subscription } from 'rxjs';
import type { Product } from '@rayrecords/shared';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { highlightSegments, moveSelection } from '../../core/palette/palette-logic';
import { StockSearchService } from '../../core/stock-search/stock-search.service';
import { isSellable, searchStock } from '../../core/stock-search/stock-search-logic';
import { Icon } from '../../core/ui/icon';
import { CartStore } from '../management/sales/cart.store';

/**
 * "Nueva venta" search: the command palette's look, but over the user's stock. Choosing a product
 * puts it in the cart (and takes the user to the sales screen); the last row creates a product.
 * Downloaded the first time it opens (see `CommandPalette`). It shares the palette's styles.
 */
@Component({
  selector: 'app-stock-search-dialog',
  imports: [Icon],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styleUrl: '../palette/palette-dialog.scss',
  styles: `
    .stock {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .meta {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--space-3);
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .meta .out {
      color: var(--danger);
    }

    .row.disabled .label {
      opacity: 0.55;
    }

    .row.add {
      margin-top: var(--space-2);
      border-top: 1px solid var(--line);
      border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    }

    .row.add app-icon {
      margin-right: var(--space-2);
      color: var(--accent);
    }
  `,
  template: `
    <!-- A deferred block never unrenders by itself: the dialog closes through this condition. -->
    @if (service.isOpen()) {
      <div class="backdrop" (mousedown)="onBackdropMousedown($event)">
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar en el stock"
          (mousedown)="keepInputFocus($event)"
        >
          <div class="search">
            <app-icon name="search" />
            <input
              #field
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="stock-listbox"
              aria-label="Buscar en el stock"
              enterkeyhint="go"
              placeholder="Buscar un producto por nombre o referencia…"
              [attr.aria-activedescendant]="activeId()"
              [value]="query()"
              (input)="onInput(field.value)"
            />
            <button
              type="button"
              class="kbd close"
              tabindex="-1"
              aria-label="Cerrar la búsqueda"
              (click)="service.hide()"
            >
              <span class="esc">Esc</span>
              <app-icon name="x" />
            </button>
          </div>

          <div class="results" id="stock-listbox" role="listbox" aria-label="Productos">
            @for (row of rows(); track row.product.id; let i = $index) {
              @let product = row.product;
              <div
                class="row"
                role="option"
                [id]="'stock-option-' + product.id"
                [class.active]="i === active()"
                [class.disabled]="!row.sellable"
                [attr.aria-selected]="i === active()"
                [attr.aria-disabled]="!row.sellable"
                (mousemove)="active.set(i)"
                (click)="pick(product)"
              >
                <span class="label">
                  <b>
                    @for (part of row.segments; track $index) {
                      <span [class.hit]="part.match">{{ part.text }}</span>
                    }
                  </b>
                  @if (product.sku) {
                    <span class="hint"> · {{ product.sku }}</span>
                  }
                </span>
                <span class="meta">
                  <span>{{ money(product.priceCents) }}</span>
                  <span [class.out]="product.quantity === 0">
                    {{ product.quantity === 0 ? 'Agotado' : product.quantity + ' uds.' }}
                  </span>
                </span>
              </div>
            }
            <div
              class="row add"
              role="option"
              id="stock-option-add"
              [class.active]="active() === addIndex()"
              [attr.aria-selected]="active() === addIndex()"
              (mousemove)="active.set(addIndex())"
              (click)="addProduct()"
            >
              <span class="label">
                <app-icon name="plus" />
                <b>Añadir un producto al stock</b>
              </span>
            </div>
            <div class="status" [class.error]="!!error()" aria-live="polite">
              {{ statusMessage() }}
            </div>
          </div>

          <div class="foot">
            <span>↑↓ navegar</span>
            <span>Enter añadir al carrito</span>
            <span>Esc cerrar</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class StockSearchDialog {
  protected readonly service = inject(StockSearchService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly cart = inject(CartStore);

  private request: Subscription | null = null;
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly money = formatCents;
  protected readonly query = signal('');
  private readonly products = signal<Product[] | null>(null);
  protected readonly error = signal('');
  /** Index of the highlighted row; the "add" row is the one after the last product. */
  protected readonly active = signal(0);

  protected readonly hits = computed(() => searchStock(this.query(), this.products() ?? []));
  /** What each row needs, worked out once per change instead of once per row and per check. */
  protected readonly rows = computed(() => {
    const inCart = new Map(this.cart.lines().map((line) => [line.productId, line.quantity]));
    return this.hits().map((product) => ({
      product,
      sellable: isSellable(product, inCart.get(product.id) ?? 0),
      segments: highlightSegments(product.name, this.query()),
    }));
  });
  protected readonly addIndex = computed(() => this.hits().length);
  protected readonly activeId = computed(() => {
    const hit = this.hits()[this.active()];
    return hit ? `stock-option-${hit.id}` : 'stock-option-add';
  });
  protected readonly statusMessage = computed(() => {
    if (this.error()) return this.error();
    if (this.products() === null) return 'Cargando el stock…';
    if (this.hits().length === 0) return 'Ningún producto coincide.';
    return '';
  });

  constructor() {
    // Each time it opens: empty search and fresh stock (it may have changed since).
    effect(() => {
      if (!this.service.isOpen()) return;
      this.query.set('');
      this.active.set(0);
      this.error.set('');
      // The list from the last time stays until the fresh one arrives; an older answer is dropped.
      this.request?.unsubscribe();
      this.request = this.api.products().subscribe({
        next: (products) => this.products.set(products),
        error: (error: unknown) => {
          this.products.set([]);
          this.error.set(apiErrorMessage(error));
        },
      });
    });
    // Focus goes to the field on open.
    effect(() => this.field()?.nativeElement.focus());
  }

  protected sellable(product: Product): boolean {
    return isSellable(product, this.inCart(product.id));
  }

  private inCart(productId: string): number {
    return this.cart.lines().find((line) => line.productId === productId)?.quantity ?? 0;
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.error.set('');
  }

  protected onBackdropMousedown(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.service.hide();
  }

  /** Click on the layer without touching the field: focus is not lost. */
  protected keepInputFocus(event: MouseEvent): void {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.service.isOpen() || event.isComposing) return;
    const count = this.hits().length + 1;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.service.hide();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.error.set('');
        this.active.set(moveSelection(this.active(), event.key === 'ArrowDown' ? 1 : -1, count));
        break;
      case 'Enter': {
        event.preventDefault();
        const hit = this.hits()[this.active()];
        if (hit) this.pick(hit);
        else this.addProduct();
        break;
      }
    }
  }

  /** Puts the product in the cart and goes to the sales screen to see it there. */
  protected pick(product: Product): void {
    if (!this.sellable(product)) {
      this.error.set(`«${product.name}» no tiene unidades disponibles.`);
      return;
    }
    this.cart.add(product);
    this.service.hide(false);
    void this.router.navigateByUrl('/gestion/ventas');
  }

  protected addProduct(): void {
    this.service.hide(false);
    void this.router.navigate(['/gestion/stock'], {
      queryParams: { nuevo: 1 },
    });
  }
}
