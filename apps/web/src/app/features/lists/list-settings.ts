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
import type { Item, List } from '@rayrecords/shared';
import { DialogModule } from 'primeng/dialog';
import { apiErrorMessage } from '../../core/api/errors';
import { ColumnEditor } from './column-editor';
import {
  buildColumns,
  buildFieldDefs,
  newColumn,
  newField,
  type DraftColumn,
  type DraftField,
  type DraftRow,
} from './create-logic';
import { ListsStore } from './lists.store';
import {
  MAX_COLUMNS,
  MAX_FIELDS,
  cardsPerColumn,
  columnDeleteBlock,
  columnsToDrafts,
  fieldsToDrafts,
  settingsProblem,
} from './settings-logic';

/**
 * Settings of a board or a table: the name and the columns (rename, colour or kind, options,
 * order, add, delete). Existing columns keep their key, so nothing stored is lost: a deleted table
 * column only hides its data, and a board column that still holds cards cannot be deleted.
 * A click outside does not close the dialog while there are unsaved changes.
 */
@Component({
  selector: 'app-list-settings',
  imports: [DialogModule, ColumnEditor],
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .hint {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
    }

    .foot .alert {
      flex: 1 1 100%;
      margin: 0;
    }

    @media (width <= 767px) {
      :host ::ng-deep .list-settings {
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .form > .field .input,
      .foot .btn,
      .form .input {
        font-size: max(16px, var(--text-base));
      }
    }
  `,
  template: `
    <p-dialog
      header="Configurar la lista"
      [visible]="open()"
      (visibleChange)="$event || cancel()"
      [modal]="true"
      [draggable]="false"
      [closeOnEscape]="!dirty()"
      [dismissableMask]="!dirty()"
      [style]="{ width: 'min(640px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="list-settings"
    >
      <form id="settings-form" class="form" novalidate (submit)="save($event)">
        <label class="field">
          <span>Nombre de la lista</span>
          <input
            #nameInput
            class="input"
            type="text"
            autocomplete="off"
            required
            maxlength="80"
            [value]="name()"
            (input)="name.set(nameInput.value)"
          />
        </label>

        @if (list().board) {
          <app-column-editor
            mode="board"
            [rows]="columns()"
            [max]="maxColumns"
            [deleteBlock]="deleteBlock"
            (rowsChange)="setColumns($event)"
            (add)="addColumn()"
          />
          <p class="hint">
            Arrastra el asa para cambiar el orden. Una columna con tarjetas no se puede borrar:
            muévelas antes a otra.
          </p>
        } @else {
          <app-column-editor
            mode="table"
            removeHint="Quitar la columna (sus datos se conservan, solo se ocultan)"
            [rows]="fields()"
            [max]="maxFields"
            (rowsChange)="setFields($event)"
            (add)="addField()"
          />
          <p class="hint">
            Arrastra el asa para cambiar el orden. Quitar una columna solo la oculta: sus datos
            siguen guardados en cada fila.
          </p>
        }
      </form>

      <ng-template #footer>
        <div class="foot">
          @if (error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="cancel()">Cancelar</button>
          <button
            type="submit"
            form="settings-form"
            class="btn primary"
            [disabled]="!!problem() || !dirty() || saving()"
            [title]="problem() ?? ''"
          >
            Guardar
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ListSettings {
  private readonly store = inject(ListsStore);

  readonly list = input.required<List>();
  /** The dialog is shown; the drafts are rebuilt from the list each time it opens. */
  readonly open = input(false);
  /** The list's cards, to know which board columns still hold some; `null` while not known. */
  readonly items = input<Item[] | null>(null);

  /** Closed without saving. */
  readonly closed = output<void>();
  /** Saved: the list as the API returned it. */
  readonly saved = output<List>();

  protected readonly maxColumns = MAX_COLUMNS;
  protected readonly maxFields = MAX_FIELDS;

  protected readonly name = signal('');
  protected readonly columns = signal<DraftColumn[]>([]);
  protected readonly fields = signal<DraftField[]>([]);
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  private nextId = 1;
  /** Every key the list had when the dialog opened: new columns never reuse one. */
  private reserved: string[] = [];

  protected readonly rows = computed(() => (this.list().board ? this.columns() : this.fields()));

  protected readonly problem = computed(() =>
    settingsProblem(this.name(), this.rows(), this.list().board ? 'column' : 'field'),
  );

  /** Anything different from what is saved. */
  protected readonly dirty = computed(() => {
    const list = this.list();
    if (this.name().trim() !== list.name) return true;
    const board = list.board;
    if (board) {
      const now = this.columns().map((c) => [
        c.key ?? null,
        c.label.trim(),
        c.color ?? null,
        c.icon ?? null,
      ]);
      const before = board.columns.map((c) => [c.key, c.label, c.color ?? null, c.icon ?? null]);
      return JSON.stringify(now) !== JSON.stringify(before);
    }
    const now = this.fields().map((f) => [
      f.key ?? null,
      f.label.trim(),
      f.type,
      f.type === 'select' ? f.options : [],
    ]);
    const before = list.fieldDefs.map((f) => [
      f.key,
      f.label,
      f.type,
      f.type === 'select' ? (f.options ?? []) : [],
    ]);
    return JSON.stringify(now) !== JSON.stringify(before);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    const list = this.list();
    this.name.set(list.name);
    this.error.set('');
    this.saving.set(false);
    this.reserved = [
      ...list.fieldDefs.map((f) => f.key),
      ...(list.board?.columns.map((c) => c.key) ?? []),
    ];
    this.nextId = 1;
    this.columns.set(columnsToDrafts(list.board?.columns ?? [], this.nextId));
    this.nextId += this.columns().length;
    this.fields.set(fieldsToDrafts(list.fieldDefs, this.nextId));
    this.nextId += this.fields().length;
  }

  /** Why each board column cannot be deleted (cards in a deleted column would be orphaned). */
  private readonly blocks = computed(() => {
    // The API does not check cards when columns change, so count them here.
    const counts = cardsPerColumn(this.items() ?? []);
    const columns = this.columns();
    return new Map(columns.map((c) => [c.id, columnDeleteBlock(c, counts, columns.length)]));
  });

  /** While the cards are not known, no column can be deleted (the API does not check them). */
  protected readonly deleteBlock = (column: DraftColumn): string | null =>
    this.items() ? (this.blocks().get(column.id) ?? null) : 'Comprobando las tarjetas…';

  protected cancel(): void {
    this.closed.emit();
  }

  // Rows: the editor changes them, the dialog only adds new ones

  protected setFields(rows: DraftRow[]): void {
    this.fields.set(rows as DraftField[]);
  }

  protected setColumns(rows: DraftRow[]): void {
    this.columns.set(rows as DraftColumn[]);
  }

  protected addField(): void {
    this.fields.update((all) => [...all, newField(this.nextId++)]);
  }

  protected addColumn(): void {
    this.columns.update((all) => [...all, newColumn(this.nextId++, all)]);
  }

  // Saving

  protected save(event: Event): void {
    event.preventDefault();
    if (this.problem() || !this.dirty() || this.saving()) return;
    const list = this.list();
    const name = this.name().trim();
    // `fieldDefs` is always sent: the API's edit schema clears it when absent.
    const input = list.board
      ? {
          name,
          fieldDefs: list.fieldDefs,
          board: { columns: buildColumns(this.columns(), this.reserved) },
        }
      : { name, fieldDefs: buildFieldDefs(this.fields(), this.reserved) };
    this.saving.set(true);
    this.error.set('');
    this.store.update(list, input).subscribe({
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
