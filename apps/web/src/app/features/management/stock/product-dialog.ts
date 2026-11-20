import { Component, input, output, viewChild } from '@angular/core';
import type { Product, StockCategory } from '@rayrecords/shared';
import { DialogModule } from 'primeng/dialog';
import { ProductForm } from './product-form';

/**
 * Creates a product or edits an existing one, in a dialog around the shared `ProductForm`. It
 * notifies with `saved`. On a phone it fills the screen (the stock page uses a bottom sheet there
 * instead); with unsaved changes a click outside does not close it.
 */
@Component({
  selector: 'app-product-dialog',
  imports: [DialogModule, ProductForm],
  styles: `
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      width: 100%;
    }

    .foot .alert {
      flex: 1 1 100%;
      margin: 0;
    }

    @media (width <= 767px) {
      :host ::ng-deep .product-dialog {
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .foot .btn {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <p-dialog
      [header]="product() ? 'Editar producto' : 'Nuevo producto'"
      [visible]="open()"
      (visibleChange)="$event || closed.emit()"
      (onShow)="form()?.focusName()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!form()?.dirty()"
      [style]="{ width: 'min(560px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="product-dialog"
    >
      <app-product-form
        [product]="product()"
        [categories]="categories()"
        [resetOn]="open()"
        (saved)="saved.emit($event)"
      />

      <ng-template #footer>
        <div class="foot">
          @if (form()?.error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button
            type="submit"
            form="product-form"
            class="btn primary"
            [disabled]="form()?.saving()"
          >
            {{ product() ? 'Guardar' : 'Añadir producto' }}
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ProductDialog {
  readonly open = input(false);
  /** Product to edit; `null` creates a new one. */
  readonly product = input<Product | null>(null);
  readonly categories = input.required<StockCategory[]>();

  readonly saved = output<Product>();
  readonly closed = output<void>();

  protected readonly form = viewChild(ProductForm);
}
