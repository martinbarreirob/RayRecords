import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Product, StockCategory } from '@rayrecords/shared';
import { DialogModule } from 'primeng/dialog';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { CategorySelect, type CategoryOption } from '../../categories/category-select';
import { prefersNativePickers } from '../../../core/ui/native-pickers';
import {
  EMPTY_DRAFT,
  draftOf,
  readDraft,
  toCreate,
  type DraftField,
  type ProductDraft,
} from './stock-logic';

/**
 * Creates a product or edits an existing one. It saves on its own and notifies with `saved`.
 * On a phone it fills the screen; with unsaved changes a click outside does not close it.
 */
@Component({
  selector: 'app-product-dialog',
  imports: [DialogModule, FormsModule, CategorySelect],
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
    }

    .wide {
      grid-column: 1 / -1;
    }

    .two {
      grid-column: span 2;
    }

    .input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    .help {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    :host ::ng-deep .p-select {
      width: 100%;
    }

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

      .grid {
        grid-template-columns: 1fr;
      }

      .two {
        grid-column: auto;
      }

      .foot .btn,
      .grid .input,
      :host ::ng-deep .p-select {
        min-height: var(--touch-target);
      }

      .grid .input,
      .grid .textarea {
        font-size: max(16px, var(--text-base));
      }
    }
  `,
  template: `
    <p-dialog
      [header]="product() ? 'Editar producto' : 'Nuevo producto'"
      [visible]="open()"
      (visibleChange)="$event || closed.emit()"
      (onShow)="focusName()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!dirty()"
      [style]="{ width: 'min(560px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="product-dialog"
    >
      <form id="product-form" class="grid" novalidate (submit)="save($event)">
        <label class="field two">
          <span>Nombre</span>
          <input
            id="product-name"
            class="input"
            type="text"
            name="name"
            autocomplete="off"
            required
            maxlength="120"
            [attr.aria-invalid]="invalid() === 'name' ? 'true' : null"
            [ngModel]="draft().name"
            (ngModelChange)="patch('name', $event)"
          />
        </label>

        <label class="field">
          <span>Referencia</span>
          <input
            class="input"
            type="text"
            name="sku"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="40"
            placeholder="Opcional"
            [ngModel]="draft().sku"
            (ngModelChange)="patch('sku', $event)"
          />
        </label>

        <div class="field wide">
          <span id="product-category">Categoría</span>
          <app-category-select
            [options]="categoryOptions()"
            [value]="draft().categoryId"
            [showClear]="true"
            (valueChange)="patch('categoryId', $event)"
            ariaLabelledBy="product-category"
          />
        </div>

        <label class="field">
          <span>Cantidad</span>
          <input
            id="product-quantity"
            class="input num"
            type="text"
            name="quantity"
            inputmode="numeric"
            autocomplete="off"
            placeholder="0"
            [attr.aria-invalid]="invalid() === 'quantity' ? 'true' : null"
            [ngModel]="draft().quantity"
            (ngModelChange)="patch('quantity', $event)"
          />
        </label>

        <label class="field">
          <span>Mínimo</span>
          <input
            id="product-minQuantity"
            class="input num"
            type="text"
            name="minQuantity"
            inputmode="numeric"
            autocomplete="off"
            placeholder="0"
            aria-describedby="product-min-help"
            [attr.aria-invalid]="invalid() === 'minQuantity' ? 'true' : null"
            [ngModel]="draft().minQuantity"
            (ngModelChange)="patch('minQuantity', $event)"
          />
        </label>

        <label class="field">
          <span>Precio (€)</span>
          <input
            id="product-price"
            class="input num"
            type="text"
            name="price"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0,00"
            [attr.aria-invalid]="invalid() === 'price' ? 'true' : null"
            [ngModel]="draft().price"
            (ngModelChange)="patch('price', $event)"
          />
        </label>

        <small id="product-min-help" class="help wide">
          Con esa cantidad o menos, el producto se marca como «stock bajo». Con 0 no avisa.
        </small>

        <label class="field wide">
          <span>Notas</span>
          <textarea
            class="textarea"
            name="notes"
            rows="2"
            maxlength="500"
            [ngModel]="draft().notes"
            (ngModelChange)="patch('notes', $event)"
          ></textarea>
        </label>
      </form>

      <ng-template #footer>
        <div class="foot">
          @if (error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button type="submit" form="product-form" class="btn primary" [disabled]="saving()">
            {{ product() ? 'Guardar' : 'Añadir producto' }}
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ProductDialog {
  private readonly api = inject(ApiClient);

  readonly open = input(false);
  /** Product to edit; `null` creates a new one. */
  readonly product = input<Product | null>(null);
  readonly categories = input.required<StockCategory[]>();

  readonly saved = output<Product>();
  readonly closed = output<void>();

  protected readonly categoryOptions = computed<CategoryOption[]>(() =>
    this.categories().map((category) => ({
      value: category.id,
      label: category.name,
      look: category,
    })),
  );

  protected readonly draft = signal<ProductDraft>(EMPTY_DRAFT);
  protected readonly error = signal('');
  protected readonly invalid = signal<DraftField | null>(null);
  protected readonly saving = signal(false);
  /** Draft as it was when opened: with unsaved changes, a click outside does not close the dialog. */
  private readonly initial = signal(JSON.stringify(EMPTY_DRAFT));
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.initial());

  constructor() {
    // Each time it opens, the draft starts from the product (or empty for a new one).
    effect(() => {
      if (!this.open()) return;
      const product = this.product();
      const draft = product ? draftOf(product) : EMPTY_DRAFT;
      this.initial.set(JSON.stringify(draft));
      this.draft.set(draft);
      this.error.set('');
      this.invalid.set(null);
    });
  }

  /** On open, focus goes to the name, except on touch: the keyboard would cover the form. */
  protected focusName(): void {
    if (!prefersNativePickers()) this.focus('name');
  }

  private focus(field: DraftField): void {
    document.getElementById(`product-${field}`)?.focus();
  }

  protected patch<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;
    const result = readDraft(this.draft());
    if (!result.ok) {
      this.error.set(result.message);
      this.invalid.set(result.field);
      this.focus(result.field);
      return;
    }
    this.error.set('');
    this.invalid.set(null);
    this.saving.set(true);
    const product = this.product();
    const request = product
      ? this.api.updateProduct(product.id, result.values)
      : this.api.createProduct(toCreate(result.values));
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
