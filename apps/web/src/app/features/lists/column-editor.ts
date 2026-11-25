import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../core/ui/icon';
import { ColumnStyle } from './column-style';
import {
  kindLabel,
  kindPatch,
  moveItem,
  patchRow,
  withOption,
  withoutOption,
  type DraftColumn,
  type DraftField,
  type DraftRow,
} from './create-logic';

/**
 * The rows of a list being defined, shared by the «new list» screen and the list settings: the
 * columns of a table (name, kind and, for «Opciones», the options) or of a board (state icon,
 * colour and name). They are put in order by dragging the handle on the left. The parent owns the
 * rows: every change comes out as a new array in `rowsChange`, and a new row is asked for with `add`.
 */
@Component({
  selector: 'app-column-editor',
  imports: [Icon, ColumnStyle, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
  styles: `
    :host {
      display: block;
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    .row .name {
      flex: 1 1 150px;
      min-width: 0;
    }

    .row.cdk-drag-preview {
      box-shadow: var(--shadow-lg);
    }

    .row.cdk-drag-placeholder {
      opacity: 0.35;
    }

    .rows.cdk-drop-list-dragging .row:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }

    .grip {
      cursor: grab;
      touch-action: none;
    }

    .kind {
      min-width: 120px;
      justify-content: space-between;
    }

    .options {
      display: flex;
      flex: 1 1 100%;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      padding-left: 44px;
    }

    .options .hint {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .option {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 10px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .new-option {
      width: 140px;
      min-height: 30px;
      font-size: var(--text-sm);
    }

    .add {
      margin-top: var(--space-4);
    }

    @media (width <= 767px) {
      .row .btn,
      .row .input {
        font-size: max(16px, var(--text-base));
      }

      .options {
        padding-left: 0;
      }
    }
  `,
  template: `
    <div class="rows" cdkDropList (cdkDropListDropped)="drop($event)">
      @if (mode() === 'table') {
        @for (field of fields(); track field.id) {
          @let block = blockOf(field);
          <div class="row" cdkDrag>
            <div *cdkDragPlaceholder class="row cdk-drag-placeholder"></div>
            <button
              type="button"
              class="btn ghost icon grip"
              cdkDragHandle
              aria-label="Arrastrar para cambiar el orden de la columna"
            >
              <app-icon name="grip-vertical" />
            </button>
            <input
              #fieldName
              class="input name"
              type="text"
              autocomplete="off"
              maxlength="60"
              aria-label="Nombre de la columna"
              [value]="field.label"
              (input)="patch(field.id, { label: fieldName.value })"
            />
            <button
              type="button"
              class="btn kind"
              aria-label="Cambiar el tipo de la columna"
              (click)="patch(field.id, kindPatch(field))"
            >
              {{ kind(field) }}
              <app-icon name="chevron-down" />
            </button>
            <button
              type="button"
              class="btn ghost icon"
              aria-label="Quitar la columna"
              [disabled]="!!block"
              [title]="block ?? removeHint()"
              (click)="remove(field)"
            >
              <app-icon name="x" />
            </button>
            @if (field.type === 'select') {
              <div class="options">
                <span class="hint">Opciones</span>
                @for (option of field.options; track option) {
                  <button
                    type="button"
                    class="option"
                    [attr.aria-label]="'Quitar la opción ' + option"
                    (click)="patch(field.id, { options: withoutOption(field.options, option) })"
                  >
                    {{ option }} <app-icon name="x" />
                  </button>
                }
                <input
                  #optionInput
                  class="input new-option"
                  type="text"
                  autocomplete="off"
                  maxlength="60"
                  placeholder="Nueva opción"
                  aria-label="Nueva opción"
                  (keydown.enter)="
                    $event.preventDefault(); addOption(field, optionInput); optionInput.focus()
                  "
                  (blur)="addOption(field, optionInput)"
                />
              </div>
            }
          </div>
        }
      } @else {
        @for (column of columns(); track column.id; let i = $index) {
          @let block = blockOf(column);
          <div class="row" cdkDrag>
            <div *cdkDragPlaceholder class="row cdk-drag-placeholder"></div>
            <button
              type="button"
              class="btn ghost icon grip"
              cdkDragHandle
              aria-label="Arrastrar para cambiar el orden de la columna"
            >
              <app-icon name="grip-vertical" />
            </button>
            <app-column-style
              [color]="column.color"
              [icon]="column.icon"
              [label]="column.label"
              [index]="i"
              [count]="columns().length"
              (colorChange)="patch(column.id, { color: $event })"
              (iconChange)="patch(column.id, { icon: $event })"
            />
            <input
              #columnName
              class="input name"
              type="text"
              autocomplete="off"
              maxlength="60"
              aria-label="Nombre de la columna"
              [value]="column.label"
              (input)="patch(column.id, { label: columnName.value })"
            />
            <button
              type="button"
              class="btn ghost icon"
              aria-label="Quitar la columna"
              [disabled]="!!block"
              [title]="block ?? removeHint()"
              (click)="remove(column)"
            >
              <app-icon name="x" />
            </button>
          </div>
        }
      }
    </div>
    <div class="add">
      <button type="button" class="btn" [disabled]="rows().length >= max()" (click)="add.emit()">
        <app-icon name="plus" /> Añadir columna
      </button>
    </div>
  `,
})
export class ColumnEditor {
  /** Whether the rows are the columns of a table or of a board. */
  readonly mode = input.required<'table' | 'board'>();
  readonly rows = input.required<readonly DraftRow[]>();
  /** The most rows allowed: past it, the add button is disabled. */
  readonly max = input(Number.POSITIVE_INFINITY);
  /** The fewest rows allowed: at it, the remove buttons are disabled. */
  readonly min = input(1);
  /** The tooltip of the remove button when nothing blocks it. */
  readonly removeHint = input('');
  /** Why a board column cannot be removed (for instance because it holds cards), or `null`. */
  readonly deleteBlock = input<(column: DraftColumn) => string | null>(() => null);

  /** The rows after a change: renamed, reordered, removed… */
  readonly rowsChange = output<DraftRow[]>();
  /** The user wants a new row; the parent creates it (it owns the ids). */
  readonly add = output<void>();

  protected readonly fields = computed(() =>
    this.mode() === 'table' ? (this.rows() as readonly DraftField[]) : [],
  );
  protected readonly columns = computed(() =>
    this.mode() === 'board' ? (this.rows() as readonly DraftColumn[]) : [],
  );

  protected readonly kindPatch = kindPatch;
  protected readonly withoutOption = withoutOption;

  protected kind(field: DraftField): string {
    return kindLabel(field.type);
  }

  /** Why the row cannot be removed, or `null`. */
  protected blockOf(row: DraftRow): string | null {
    const board = this.mode() === 'board';
    const own = board ? this.deleteBlock()(row as DraftColumn) : null;
    if (own) return own;
    if (this.rows().length > this.min()) return null;
    return board
      ? 'Un tablero necesita al menos una columna'
      : 'Una tabla necesita al menos una columna';
  }

  protected patch(id: number, patch: Partial<DraftRow>): void {
    this.rowsChange.emit(patchRow<DraftRow>(this.rows(), id, patch));
  }

  protected remove(row: DraftRow): void {
    if (this.blockOf(row)) return;
    this.rowsChange.emit(this.rows().filter((r) => r.id !== row.id));
  }

  protected addOption(field: DraftField, input: HTMLInputElement): void {
    const options = withOption(field.options, input.value);
    input.value = '';
    if (options) this.patch(field.id, { options });
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.rowsChange.emit(moveItem(this.rows(), event.previousIndex, event.currentIndex));
  }
}
