import {
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Product, StockCategory } from '@rayrecords/shared';
import { ApiClient } from '../../../core/api/api-client';
import { apiErrorMessage } from '../../../core/api/errors';
import { formatCents, formatUnits } from '../../../core/format';
import { Icon } from '../../../core/ui/icon';
import { BottomSheet, type SheetState } from '../../../core/ui/bottom-sheet';
import { CategoryBadge } from '../../categories/category-badge';
import { UNCATEGORIZED_LOOK } from '../../categories/uncategorized';
import { ProductForm } from './product-form';
import { marginText, type ProductRow } from './stock-logic';

/** The quick steps to either side of the amount; anything else is typed (a minus takes units out). */
const ADD_STEPS = [1, 5, 10] as const;
const TAKE_STEPS = [-10, -5, -1] as const;
/** The most units a product can hold (the API's limit). */
const MAX_UNITS = 1_000_000;

/**
 * The phone's way to see and edit a product: a bottom sheet over the stock list. Peeking it shows
 * the product (its figures and the actions "Ajustar stock", "Editar" and "Eliminar"; the stock
 * level tag sits at the right of the title); "Ajustar stock" swaps that for the current stock over
 * a plain field with −10/−5/−1 on its left and +1/+5/+10 on its right (typed, a minus takes units
 * out); expanded it is the shared `ProductForm`. With no `row` it creates a new product, directly expanded.
 */
@Component({
  selector: 'app-product-sheet',
  imports: [BottomSheet, ProductForm, CategoryBadge, Icon],
  styles: `
    .title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .level {
      flex: none;
      align-self: flex-start;
    }

    .heading {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      min-width: 0;
    }

    .name {
      overflow: hidden;
      font-size: var(--text-lg);
      font-weight: 600;
      line-height: 24px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sub {
      overflow: hidden;
      color: var(--muted);
      font-size: var(--text-sm);
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      margin: var(--space-3) 0 0;
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .actions {
      margin-top: var(--space-4);
    }

    .restock {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .restock-now {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }

    .restock-now .label {
      flex: 1 1 auto;
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .restock-qty {
      font-size: var(--text-xl);
      font-weight: 600;
    }

    .restock-qty small {
      margin-left: var(--space-1);
      color: var(--muted);
      font-size: var(--text-sm);
      font-weight: 400;
    }

    .restock-title {
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .restock-pick {
      display: flex;
      gap: var(--space-2);
    }

    .restock-pick .segmented {
      flex: 1 1 0;
      min-width: 0;
    }

    .restock-pick .segmented > button {
      flex: 1 1 0;
      min-width: 0;
      padding-inline: 0;
      font-variant-numeric: tabular-nums;
    }

    .restock-pick .input {
      flex: none;
      width: 72px;
      font-size: max(16px, var(--text-base));
      text-align: center;
    }

    .restock-after {
      margin: 0;
      color: var(--muted);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .restock-after.negative {
      color: var(--danger);
    }

    .restock .alert {
      margin: 0;
    }

    .restock-actions {
      display: flex;
      gap: var(--space-2);
    }

    .restock-actions .btn {
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
      padding: var(--space-3) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
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
        @if (row(); as product) {
          <app-category-badge size="xl" [look]="product.category ?? uncategorized" />
          <span class="heading">
            <span class="name">{{ product.name }}</span>
            <span class="sub">
              {{ product.categoryName }}
              @if (product.sku) {
                · Ref. {{ product.sku }}
              }
            </span>
          </span>
          @if (product.level === 'out') {
            <span class="badge danger level">Agotado</span>
          } @else if (product.level === 'low') {
            <span class="badge warning level">Bajo</span>
          }
        } @else {
          <span class="heading"><span class="name">Nuevo producto</span></span>
        }
      </span>

      @if (row(); as product) {
        <div sheetPeek>
          @if (restocking()) {
            <form class="restock" (submit)="$event.preventDefault(); restock(product)">
              <div class="restock-now">
                <span class="label">En stock</span>
                <span class="restock-qty num">
                  {{ units(product.quantity) }}<small>uds.</small>
                </span>
              </div>
              <span class="restock-title" id="restock-title">Unidades que salen o entran</span>
              <div class="restock-pick" role="group" aria-labelledby="restock-title">
                <div class="segmented">
                  @for (step of takeSteps; track step) {
                    <button
                      type="button"
                      [attr.aria-label]="'Quitar ' + -step"
                      (click)="nudge(step)"
                    >
                      −{{ -step }}
                    </button>
                  }
                </div>
                <input
                  class="input num"
                  type="text"
                  autocomplete="off"
                  placeholder="0"
                  aria-label="Unidades a añadir (con signo menos, a quitar)"
                  [value]="amount()"
                  (input)="amount.set($any($event.target).value)"
                />
                <div class="segmented">
                  @for (step of addSteps; track step) {
                    <button
                      type="button"
                      [attr.aria-label]="'Añadir ' + step"
                      (click)="nudge(step)"
                    >
                      +{{ step }}
                    </button>
                  }
                </div>
              </div>
              @if (amountValue(); as change) {
                <p class="restock-after" [class.negative]="outOfRange()">
                  Quedarán {{ units(product.quantity) }} {{ change < 0 ? '−' : '+' }}
                  {{ units(change < 0 ? -change : change) }} =
                  <strong>{{ units(remaining()) }} uds.</strong>
                </p>
              }
              @if (addError(); as message) {
                <p class="alert" role="alert">{{ message }}</p>
              }
              <div class="restock-actions">
                <button type="button" class="btn" (click)="closeRestock()">Cancelar</button>
                <button
                  type="submit"
                  class="btn primary"
                  [disabled]="!amountValue() || outOfRange() || adding()"
                >
                  {{ adding() ? 'Guardando…' : 'Guardar' }}
                </button>
              </div>
            </form>
          } @else {
            <dl class="stat-strip">
              <div>
                <dt>Stock</dt>
                <dd>{{ units(product.quantity) }}</dd>
              </div>
              <div>
                <dt>Precio unidad</dt>
                <dd>{{ money(product.priceCents) }}</dd>
              </div>
              <div>
                <dt>Coste unidad</dt>
                <dd>{{ money(product.costCents) }}</dd>
              </div>
              <div>
                <dt>Margen</dt>
                <dd>{{ margin(product) }}</dd>
              </div>
              <div>
                <dt>Valor total</dt>
                <dd>{{ money(product.valueCents) }}</dd>
              </div>
            </dl>
            @if (meta(product); as text) {
              <p class="meta">{{ text }}</p>
            }
            <div class="action-list actions">
              <button type="button" class="action-row" (click)="openRestock()">
                <app-icon name="plus" />
                Ajustar stock
              </button>
              <button type="button" class="action-row" (click)="state.set('expanded')">
                <app-icon name="pencil" />
                Editar producto
              </button>
              <button type="button" class="action-row danger" (click)="removed.emit(product)">
                <app-icon name="trash" />
                Eliminar
              </button>
            </div>
          }
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

  private readonly api = inject(ApiClient);
  protected readonly form = viewChild(ProductForm);
  protected readonly money = formatCents;
  protected margin = (product: Pick<Product, 'priceCents' | 'costCents'>): string =>
    marginText(product.priceCents, product.costCents);
  protected readonly addSteps = ADD_STEPS;
  protected readonly takeSteps = TAKE_STEPS;
  protected readonly uncategorized = UNCATEGORIZED_LOOK;

  // "Añadir stock": the view that replaces the summary, and the units as the user typed them.
  protected readonly restocking = signal(false);
  protected readonly amount = signal('');
  protected readonly adding = signal(false);
  protected readonly addError = signal('');

  constructor() {
    // Each product starts on its summary, with an empty box.
    effect(() => {
      this.row()?.id;
      this.resetOn();
      untracked(() => this.closeRestock());
    });
  }

  /** The units typed (negative to take out), or 0 when it is empty or not a whole number. */
  protected readonly amountValue = computed(() => {
    const text = this.amount().trim().replace('−', '-');
    return /^[+-]?\d{1,7}$/.test(text) ? Number(text) : 0;
  });

  /** What would be in stock after the change. */
  protected readonly remaining = computed(() => (this.row()?.quantity ?? 0) + this.amountValue());

  /** The change would leave less than nothing or more than a product can hold. */
  protected readonly outOfRange = computed(() => {
    const after = this.remaining();
    return after < 0 || after > MAX_UNITS;
  });

  /** A step button moves the typed amount; back at 0 the box is empty. */
  protected nudge(step: number): void {
    const next = this.amountValue() + step;
    this.amount.set(next === 0 ? '' : String(next));
  }

  protected openRestock(): void {
    this.restocking.set(true);
  }

  protected closeRestock(): void {
    this.restocking.set(false);
    this.amount.set('');
    this.addError.set('');
  }

  /** Adds (or takes out) the units: the new quantity is the stock plus them. */
  protected restock(product: ProductRow): void {
    const change = this.amountValue();
    if (!change || this.outOfRange() || this.adding()) return;
    this.adding.set(true);
    this.addError.set('');
    this.api.updateProduct(product.id, { quantity: this.remaining() }).subscribe({
      next: (saved) => {
        this.adding.set(false);
        this.closeRestock();
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.adding.set(false);
        this.addError.set(apiErrorMessage(error));
      },
    });
  }

  protected units(value: number): string {
    return formatUnits(value);
  }

  /** The minimum and the notes, the two small facts that do not get a figure of their own. */
  protected meta(product: ProductRow): string {
    const parts: string[] = [];
    if (product.minQuantity > 0) parts.push(`Mínimo ${formatUnits(product.minQuantity)} uds.`);
    if (product.notes) parts.push(product.notes);
    return parts.join(' · ');
  }

  /** Back to the summary when there is one; otherwise (a new product) the sheet closes. */
  protected cancel(): void {
    this.state.set(this.row() ? 'peek' : 'closed');
  }
}
