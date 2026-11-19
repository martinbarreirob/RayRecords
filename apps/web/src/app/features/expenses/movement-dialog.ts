import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { Category, Transaction } from '@rayrecords/shared';
import { DialogModule } from 'primeng/dialog';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { CategorySelect, type CategoryOption } from '../categories/category-select';
import type { MovementRow } from './movements-logic';
import { NO_CATEGORY } from '../categories/uncategorized';

/** The value of the "Sin categoría" entry: an option needs a value, and `null` means "no choice". */
const NONE = '';

const LONG_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * One movement: its data as the bank gave it (date, amount, description, account) and the one
 * thing that can be changed, its category. Picking one by hand protects it: the rules never
 * overwrite a category chosen this way. It saves on its own and tells with `saved`.
 */
@Component({
  selector: 'app-movement-dialog',
  imports: [DialogModule, CategorySelect],
  styles: `
    .facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3) var(--space-4);
      margin: 0 0 var(--space-4);
      padding-bottom: var(--space-4);
      border-bottom: 1px solid var(--line);
    }

    .facts div {
      min-width: 0;
    }

    .facts .wide {
      grid-column: 1 / -1;
    }

    dt {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .amount {
      font-size: var(--text-xl);
      font-weight: 600;
    }

    .positive {
      color: var(--success);
    }

    .field > span {
      color: var(--muted);
    }

    :host ::ng-deep .p-select {
      width: 100%;
    }

    .hint {
      margin-top: var(--space-2);
      font-size: var(--text-xs);
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
      :host ::ng-deep .movement-dialog {
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .foot .btn,
      :host ::ng-deep .p-select {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <p-dialog
      header="Editar movimiento"
      [visible]="!!movement()"
      (visibleChange)="$event || closed.emit()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!dirty()"
      [style]="{ width: 'min(480px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="movement-dialog"
    >
      @if (movement(); as m) {
        <dl class="facts">
          <div>
            <dt>Fecha</dt>
            <dd>{{ date(m.date) }}</dd>
          </div>
          <div>
            <dt>Importe</dt>
            <dd class="amount num" [class.positive]="m.amountCents > 0">
              {{ money(m.amountCents) }}
            </dd>
          </div>
          <div class="wide">
            <dt>Descripción</dt>
            <dd>{{ m.description }}</dd>
          </div>
          @if (accountName()) {
            <div class="wide">
              <dt>Cuenta</dt>
              <dd>{{ accountName() }}</dd>
            </div>
          }
        </dl>

        <div class="field">
          <span id="mv-edit-category">Categoría</span>
          <app-category-select
            [options]="options()"
            [value]="draft()"
            (valueChange)="draft.set($event ?? '')"
            ariaLabelledBy="mv-edit-category"
          />
        </div>
        <p class="hint muted">Si la eliges tú, las reglas no la cambian al reaplicarse.</p>
      }

      <ng-template #footer>
        <div class="foot">
          @if (error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button
            type="button"
            class="btn primary"
            [disabled]="saving() || !dirty()"
            (click)="save()"
          >
            {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class MovementDialog {
  private readonly api = inject(ApiClient);

  /** Movement to edit; `null` keeps the dialog closed. */
  readonly movement = input<MovementRow | null>(null);
  readonly categories = input.required<Category[]>();
  readonly accountName = input('');

  readonly saved = output<Transaction>();
  readonly closed = output<void>();

  /** The category picked: its key, or `''` for none. */
  protected readonly draft = signal(NONE);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly money = formatCents;

  protected readonly options = computed<CategoryOption[]>(() => [
    { value: NONE, label: NO_CATEGORY, look: null },
    ...this.categories().map((category) => ({
      value: category.key,
      label: category.name,
      look: category,
    })),
  ]);
  protected readonly dirty = computed(() => this.draft() !== (this.movement()?.category ?? NONE));

  constructor() {
    // Each time it opens, the choice starts from what the movement has.
    effect(() => {
      const movement = this.movement();
      untracked(() => {
        this.draft.set(movement?.category ?? NONE);
        this.error.set('');
        this.saving.set(false);
      });
    });
  }

  protected date(day: string): string {
    return LONG_DATE.format(new Date(`${day}T12:00:00`));
  }

  protected save(): void {
    const movement = this.movement();
    if (!movement || this.saving() || !this.dirty()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .setCategory(movement.id, { category: this.draft() || null, createRule: false })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.saved.emit(updated);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(apiErrorMessage(error));
        },
      });
  }
}
