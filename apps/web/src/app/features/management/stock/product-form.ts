import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Product, StockCategory } from '@rayrecords/shared';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { eurosToCents } from '../../../core/format';
import { prefersNativePickers } from '../../../core/ui/native-pickers';
import { CategorySelect, type CategoryOption } from '../../categories/category-select';
import {
  EMPTY_DRAFT,
  draftOf,
  readDraft,
  toCreate,
  type DraftField,
  type ProductDraft,
  marginText,
} from './stock-logic';

/**
 * The fields of a product, with their validation and saving. It is shared by the desktop dialog
 * and the phone's bottom sheet, which add their own frame and buttons: the submit button lives
 * outside, tied to this form by its `formId`. It notifies with `saved`; `error`, `saving` and
 * `dirty` are read by the frame for its footer.
 */
@Component({
  selector: 'app-product-form',
  imports: [FormsModule, CategorySelect],
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

    @media (width <= 767px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .two {
        grid-column: auto;
      }

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
    <form [id]="formId()" class="grid" novalidate (submit)="save($event)">
      <label class="field two">
        <span>Nombre</span>
        <input
          [id]="fieldId('name')"
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
        <span [id]="fieldId('category')">Categoría</span>
        <app-category-select
          [options]="categoryOptions()"
          [value]="draft().categoryId"
          [showClear]="true"
          (valueChange)="patch('categoryId', $event)"
          [ariaLabelledBy]="fieldId('category')"
        />
      </div>

      <label class="field">
        <span>Cantidad</span>
        <input
          [id]="fieldId('quantity')"
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
          [id]="fieldId('minQuantity')"
          class="input num"
          type="text"
          name="minQuantity"
          inputmode="numeric"
          autocomplete="off"
          placeholder="0"
          [attr.aria-describedby]="fieldId('min-help')"
          [attr.aria-invalid]="invalid() === 'minQuantity' ? 'true' : null"
          [ngModel]="draft().minQuantity"
          (ngModelChange)="patch('minQuantity', $event)"
        />
      </label>

      <label class="field">
        <span>Coste (€)</span>
        <input
          [id]="fieldId('cost')"
          class="input num"
          type="text"
          name="cost"
          inputmode="decimal"
          autocomplete="off"
          placeholder="0,00"
          [attr.aria-describedby]="fieldId('margin')"
          [attr.aria-invalid]="invalid() === 'cost' ? 'true' : null"
          [ngModel]="draft().cost"
          (ngModelChange)="patch('cost', $event)"
        />
      </label>

      <label class="field">
        <span>Precio (€)</span>
        <input
          [id]="fieldId('price')"
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

      <small [id]="fieldId('margin')" class="help two margin" aria-live="polite">
        {{ marginHelp() }}
      </small>

      <small [id]="fieldId('min-help')" class="help wide">
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
  `,
})
export class ProductForm {
  private readonly api = inject(ApiClient);

  /** Product to edit; `null` creates a new one. */
  readonly product = input<Product | null>(null);
  readonly categories = input.required<StockCategory[]>();
  /** The id of the form element, for a submit button outside of it. */
  readonly formId = input('product-form');
  /** Prefix of the field ids, so two forms on one page never share one. */
  readonly idPrefix = input('product');
  /** Whenever this changes the draft starts over from the product (a dialog opening, a sheet). */
  readonly resetOn = input<unknown>(null);

  readonly saved = output<Product>();

  protected readonly categoryOptions = computed<CategoryOption[]>(() =>
    this.categories().map((category) => ({
      value: category.id,
      label: category.name,
      look: category,
    })),
  );

  protected readonly draft = signal<ProductDraft>(EMPTY_DRAFT);
  /** What a unit leaves, worked out as the price and the cost are typed. */
  protected readonly marginHelp = computed(() => {
    const { price, cost } = this.draft();
    const priceCents = price.trim() === '' ? 0 : eurosToCents(price);
    const costCents = cost.trim() === '' ? 0 : eurosToCents(cost);
    if (priceCents === null || costCents === null)
      return 'Escribe importes válidos para ver el margen.';
    if (costCents === 0)
      return 'Sin coste: el beneficio de este producto se cuenta como todo el precio.';
    return `Margen por unidad: ${marginText(priceCents, costCents)}`;
  });
  readonly error = signal('');
  protected readonly invalid = signal<DraftField | null>(null);
  readonly saving = signal(false);
  /** Draft as it was when it started: with unsaved changes the frame does not close on a click outside. */
  private readonly initial = signal(JSON.stringify(EMPTY_DRAFT));
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.initial());

  constructor() {
    effect(() => {
      this.resetOn();
      const product = this.product();
      const draft = product ? draftOf(product) : EMPTY_DRAFT;
      this.initial.set(JSON.stringify(draft));
      this.draft.set(draft);
      this.error.set('');
      this.invalid.set(null);
    });
  }

  protected fieldId(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  /** Focus goes to the name, except on touch: the keyboard would cover the form. */
  focusName(): void {
    if (!prefersNativePickers()) this.focus('name');
  }

  private focus(field: DraftField): void {
    document.getElementById(this.fieldId(field))?.focus();
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
