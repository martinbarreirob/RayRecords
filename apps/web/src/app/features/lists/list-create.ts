import { Component, computed, inject, output, signal } from '@angular/core';
import type { List } from '@rayrecords/shared';
import { apiErrorMessage } from '../../core/api/errors';
import { Icon } from '../../core/ui/icon';
import { ColumnEditor } from './column-editor';
import {
  DEFAULT_BOARD,
  boardList,
  newColumn,
  newField,
  simpleList,
  tableList,
  type DraftColumn,
  type DraftField,
  type DraftRow,
  type NewListType,
} from './create-logic';
import { aliasError, cleanAlias } from './lists-logic';
import { ListsStore } from './lists.store';

/**
 * The way to a new list, in two steps: what it is (a table, a board or a simple list: three cards,
 * one under the other, near the top) and what it holds. A table asks for its
 * columns (their name, kind and, for «Opciones», the options to pick from) and a board for its
 * columns (name and accent colour); both are put in order by dragging the handle on the left.
 */
@Component({
  selector: 'app-list-create',
  imports: [Icon, ColumnEditor],
  styles: `
    :host {
      display: block;
    }

    .back {
      margin-bottom: var(--space-3);
      padding-inline: 0;
      border: 0;
      background: none;
      color: var(--muted);

      &:hover {
        color: var(--text);
      }
    }

    /* Step 1: the three cards, centred horizontally and close to the top. */
    .pick {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-5);
      margin-top: var(--space-6);
    }

    .pick h2 {
      font-size: var(--text-xl);
      text-align: center;
    }

    /* Equal rows: the three cards share width and height whatever the text length. */
    .types {
      display: grid;
      grid-auto-rows: 1fr;
      gap: var(--space-3);
      width: min(560px, 100%);
    }

    .type {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      width: 100%;
      padding: var(--space-4) var(--space-5);
      border: 1.5px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover {
        border-color: var(--accent);
      }

      strong {
        display: block;
        font-size: var(--text-base);
      }

      small {
        display: block;
        margin-top: 2px;
        color: var(--muted);
        font-size: var(--text-sm);
      }
    }

    .badge-ico {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      font-size: 20px;
    }

    /* Step 2 */
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 760px;
    }

    .step {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .names {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .names .field {
      flex: 1 1 240px;
    }

    .actions {
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }

    @media (width <= 767px) {
      .pick {
        margin-top: var(--space-4);
      }

      .back {
        min-height: var(--touch-target);
      }

      .type {
        padding: var(--space-4);
      }
    }
  `,
  template: `
    <button type="button" class="btn ghost back" (click)="back()">
      <app-icon name="arrow-left" /> Volver
    </button>

    @if (step() === 'type') {
      <section class="pick" aria-labelledby="pick-title">
        <h2 id="pick-title">¿Qué quieres organizar?</h2>
        <div class="types">
          <button type="button" class="type" (click)="pick('table')">
            <span class="badge-ico"><app-icon name="layout-grid" /></span>
            <span>
              <strong>Tabla</strong>
              <small>
                Tú decides las columnas y, en las de opciones, qué opciones hay. Para clientes,
                inventarios, datos.
              </small>
            </span>
          </button>
          <button type="button" class="type" (click)="pick('board')">
            <span class="badge-ico"><app-icon name="stack-2" /></span>
            <span>
              <strong>Kanban</strong>
              <small>
                Tarjetas que arrastras de una columna a otra. Por defecto: por hacer, en curso y
                hecho.
              </small>
            </span>
          </button>
          <button type="button" class="type" (click)="pick('simple')">
            <span class="badge-ico"><app-icon name="list" /></span>
            <span>
              <strong>Lista simple</strong>
              <small>Cosas que marcar como hechas. Compras, recados, tareas sueltas.</small>
            </span>
          </button>
        </div>
      </section>
    } @else {
      <form class="form" (submit)="create($event)">
        <span class="step">Paso 2 de 2</span>

        <div class="names">
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
          <label class="field">
            <span>Alias de captura (opcional)</span>
            <input
              #aliasInput
              class="input"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              maxlength="20"
              placeholder="Sin espacios, p. ej. libro"
              [attr.aria-invalid]="aliasProblem() ? 'true' : null"
              [value]="alias()"
              (input)="alias.set(aliasInput.value)"
            />
            @if (aliasProblem(); as problem) {
              <span class="field-error">{{ problem }}</span>
            }
          </label>
        </div>

        @if (type() === 'table') {
          <app-column-editor
            mode="table"
            [rows]="fields()"
            [min]="0"
            (rowsChange)="setFields($event)"
            (add)="addField()"
          />
          <p class="step">
            Arrastra el asa de una columna para cambiar su posición. Una columna de tipo Fecha hace
            que cada fila aparezca en el calendario.
          </p>
        } @else if (type() === 'board') {
          <app-column-editor
            mode="board"
            [rows]="columns()"
            (rowsChange)="setColumns($event)"
            (add)="addColumn()"
          />
          <p class="step">
            Arrastra el asa de una columna para cambiar el orden. El círculo es su color de acento.
          </p>
        }

        @if (error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }

        <div class="actions">
          <button type="submit" class="btn primary" [disabled]="!valid() || saving()">
            Crear lista
          </button>
        </div>
      </form>
    }
  `,
})
export class ListCreate {
  private readonly store = inject(ListsStore);

  /** The list was created: the page opens it. */
  readonly created = output<List>();
  /** Back out of the first step: the page shows its lists again. */
  readonly cancelled = output<void>();

  protected readonly step = signal<'type' | 'details'>('type');
  protected readonly type = signal<NewListType>('table');
  protected readonly name = signal('');
  protected readonly alias = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  private nextId = 1;
  protected readonly fields = signal<DraftField[]>([]);
  protected readonly columns = signal<DraftColumn[]>([]);

  protected readonly aliasProblem = computed(() => aliasError(cleanAlias(this.alias())));
  protected readonly valid = computed(() => {
    if (!this.name().trim() || this.aliasProblem()) return false;
    if (this.type() === 'table') return this.fields().some((f) => f.label.trim());
    if (this.type() === 'board') return this.columns().some((c) => c.label.trim());
    return true;
  });

  protected pick(type: NewListType): void {
    this.type.set(type);
    this.error.set('');
    this.name.set({ table: 'Tabla', board: 'Tablero', simple: 'Lista' }[type]);
    if (type === 'table' && this.fields().length === 0) {
      this.fields.set([
        { id: this.nextId++, label: 'Nombre', type: 'text', options: [] },
        {
          id: this.nextId++,
          label: 'Estado',
          type: 'select',
          options: ['Pendiente', 'En curso', 'Hecho'],
        },
      ]);
    }
    if (type === 'board' && this.columns().length === 0) {
      this.columns.set(DEFAULT_BOARD.map((c) => ({ ...c, id: this.nextId++ })));
    }
    this.step.set('details');
  }

  protected back(): void {
    if (this.step() === 'details') this.step.set('type');
    else this.cancelled.emit();
  }

  // Rows: the editor changes them, the screen only adds new ones

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

  // Creating

  protected create(event: Event): void {
    event.preventDefault();
    if (!this.valid() || this.saving()) return;
    const alias = cleanAlias(this.alias());
    const type = this.type();
    const input =
      type === 'table'
        ? tableList(this.name(), this.fields(), alias)
        : type === 'board'
          ? boardList(this.name(), this.columns(), alias)
          : simpleList(this.name(), alias);
    this.saving.set(true);
    this.error.set('');
    this.store.create(input).subscribe({
      next: (list) => {
        this.saving.set(false);
        this.created.emit(list);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
