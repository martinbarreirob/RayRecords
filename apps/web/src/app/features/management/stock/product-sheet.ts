import { Component, input, model, output, viewChild } from '@angular/core';
import type { Product, StockCategory } from '@rayrecords/shared';
import { formatCents } from '../../../core/format';
import { BottomSheet, type SheetState } from '../../../core/ui/bottom-sheet';
import { Icon } from '../../../core/ui/icon';
import { CategoryLabel } from '../../categories/category-label';
import { ProductForm } from './product-form';
import type { ProductRow } from './stock-logic';

const UNITS = new Intl.NumberFormat('es-ES');

/**
 * The phone's way to see and edit a product: a bottom sheet over the stock list. Peeking it shows
 * the product (stock, price, value, category) with Editar and Eliminar; expanded it is the shared
 * `ProductForm`. With no `row` it creates a new product, directly expanded.
 */
@Component({
  selector: 'app-product-sheet',
  imports: [BottomSheet, ProductForm, CategoryLabel, Icon],
  styles: `
    .title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .name {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      font-size: var(--text-lg);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title app-icon {
      color: var(--muted);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
      margin: 0 0 var(--space-4);
    }

    .stats div {
      min-width: 0;
    }

    .stats dt {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .stats dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    .qty-line {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .actions {
      display: flex;
      gap: var(--space-2);
    }

    .actions .btn {
      flex: 1 1 0;
      min-height: var(--touch-target);
    }

    .scroll {
      flex: 1 1 auto;
      min-height: 0;
      padding: var(--space-4);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .foot {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--line);
    }

    .foot .alert {
      flex: 1 1 100%;
      margin: 0;
    }

    .foot .btn {
      flex: 1 1 0;
      min-height: var(--touch-target);
    }
  `,
  template: `
    <app-bottom-sheet
      [(state)]="state"
      [label]="row() ? 'Producto: ' + row()!.name : 'Nuevo producto'"
      [collapsible]="!!row()"
    >
      <span sheetHeader class="title">
        <span class="name">{{ row() ? row()!.name : 'Nuevo producto' }}</span>
        <app-icon [name]="state() === 'expanded' ? 'chevron-down' : 'chevron-up'" />
      </span>

      @if (row(); as product) {
        <div sheetPeek>
          <dl class="stats">
            <div>
              <dt>Stock</dt>
              <dd class="qty-line">
                {{ units(product.quantity) }}
                @if (product.level === 'out') {
                  <span class="badge danger">Agotado</span>
                } @else if (product.level === 'low') {
                  <span class="badge warning">Bajo</span>
                }
              </dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>{{ money(product.priceCents) }}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>
                <strong>{{ money(product.valueCents) }}</strong>
              </dd>
            </div>
            <div>
              <dt>Categoría</dt>
              <dd>
                <app-category-label [look]="product.category" [name]="product.categoryName" />
              </dd>
            </div>
          </dl>
          <div class="actions">
            <button type="button" class="btn" (click)="state.set('expanded')">Editar</button>
            <button type="button" class="btn danger" (click)="removed.emit(product)">
              Eliminar
            </button>
          </div>
        </div>
      }

      <div class="scroll">
        <app-product-form
          formId="sheet-product-form"
          idPrefix="sheet-product"
          [product]="row()"
          [categories]="categories()"
          [resetOn]="resetOn()"
          (saved)="saved.emit($event)"
        />
      </div>
      <div class="foot">
        @if (form()?.error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }
        <button type="button" class="btn" (click)="cancel()">Cancelar</button>
        <button
          type="submit"
          form="sheet-product-form"
          class="btn primary"
          [disabled]="form()?.saving()"
        >
          {{ row() ? 'Guardar' : 'Añadir producto' }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class ProductSheet {
  readonly state = model<SheetState>('closed');
  /** The product on show; `null` is a new one. */
  readonly row = input<ProductRow | null>(null);
  readonly categories = input.required<StockCategory[]>();
  /** Changes every time the sheet is opened for something, so the form starts from the product. */
  readonly resetOn = input<unknown>(null);

  readonly saved = output<Product>();
  /** Eliminar was pressed: the page asks to confirm and deletes. */
  readonly removed = output<ProductRow>();

  protected readonly form = viewChild(ProductForm);
  protected readonly money = formatCents;

  protected units(value: number): string {
    return UNITS.format(value);
  }

  /** Back to the summary when there is one; otherwise (a new product) the sheet closes. */
  protected cancel(): void {
    this.state.set(this.row() ? 'peek' : 'closed');
  }
}
