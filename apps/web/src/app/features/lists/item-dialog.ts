import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import type { Extra, Item, List, UpdateItem } from '@rayrecords/shared';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { DateField } from '../../core/ui/date-field';
import { prefersNativePickers } from '../../core/ui/native-pickers';
import { fromInputValue, normalizeUrl, toInputValue } from './field-format';

/** Editing draft: everything as text, as the user types it. */
interface Draft {
  title: string;
  text: string;
  dueDate: string;
  url: string;
  tags: string;
  column: string;
  fields: Record<string, string>;
}

/**
 * Full editing of an item (title, notes, date, link, labels, column and the list's fields). Used by
 * the table and the board; it saves on its own and notifies with `saved`.
 *
 * On mobile it fills the screen. With unsaved changes, a click outside does not close it.
 */
@Component({
  selector: 'app-item-dialog',
  imports: [DialogModule, FormsModule, SelectModule, CheckboxModule, DateField],
  styles: `
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3) var(--space-4);
    }

    .wide {
      grid-column: 1 / -1;
    }

    .field > label {
      color: var(--muted);
    }

    .input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    .check {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--control-height);
      cursor: pointer;
    }

    .check span {
      color: var(--text);
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

    /* Mobile: the dialog fills the screen and the content scrolls inside. */
    @media (width <= 767px) {
      :host ::ng-deep .item-dialog {
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
      }

      .grid {
        grid-template-columns: 1fr;
      }

      .check {
        min-height: var(--touch-target);
      }

      .foot .btn {
        min-height: var(--touch-target);
      }

      :host ::ng-deep .p-select,
      .grid .input {
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
      header="Editar elemento"
      [visible]="!!item()"
      (visibleChange)="$event || closed.emit()"
      (onShow)="focusTitle()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!dirty()"
      [style]="{ width: 'min(560px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="item-dialog"
    >
      @if (draft(); as d) {
        <form id="item-form" class="grid" novalidate (submit)="save($event)">
          <label class="field wide">
            <span>Título</span>
            <input
              #titleInput
              class="input"
              type="text"
              autocomplete="off"
              required
              [attr.aria-invalid]="titleInvalid() ? 'true' : null"
              [value]="d.title"
              (input)="patch('title', titleInput.value)"
            />
          </label>

          <label class="field wide">
            <span>Notas</span>
            <textarea
              #textInput
              class="textarea"
              rows="3"
              [value]="d.text"
              (input)="patch('text', textInput.value)"
            ></textarea>
          </label>

          <div class="field">
            <label for="dlg-due">Fecha</label>
            <app-date-field
              inputId="dlg-due"
              [value]="d.dueDate"
              (valueChange)="patch('dueDate', $event)"
            />
          </div>

          @if (list().board; as board) {
            <div class="field">
              <span id="dlg-column">Columna</span>
              <p-select
                [options]="board.columns"
                optionLabel="label"
                optionValue="key"
                [ngModel]="d.column"
                [ngModelOptions]="{ standalone: true }"
                (onChange)="patch('column', $event.value ?? '')"
                ariaLabelledBy="dlg-column"
                appendTo="body"
                styleClass="w-full"
              />
            </div>
          }

          @for (field of list().fieldDefs; track field.key) {
            @if (field.type === 'select') {
              <div class="field">
                <span [id]="'dlg-' + field.key">{{ field.label }}</span>
                <p-select
                  [options]="field.options ?? []"
                  [ngModel]="d.fields[field.key] || null"
                  [ngModelOptions]="{ standalone: true }"
                  (onChange)="patchField(field.key, $event.value ?? '')"
                  [showClear]="true"
                  placeholder="Sin valor"
                  [ariaLabelledBy]="'dlg-' + field.key"
                  appendTo="body"
                  styleClass="w-full"
                />
              </div>
            } @else if (field.type === 'boolean') {
              <label class="field check">
                <p-checkbox
                  [binary]="true"
                  [ngModel]="d.fields[field.key] === 'true'"
                  [ngModelOptions]="{ standalone: true }"
                  (onChange)="patchField(field.key, $event.checked ? 'true' : 'false')"
                />
                <span>{{ field.label }}</span>
              </label>
            } @else if (field.type === 'date') {
              <div class="field">
                <label [attr.for]="'dlg-f-' + field.key">{{ field.label }}</label>
                <app-date-field
                  [inputId]="'dlg-f-' + field.key"
                  [value]="d.fields[field.key] ?? ''"
                  (valueChange)="patchField(field.key, $event)"
                />
              </div>
            } @else {
              <label class="field">
                <span>{{ field.label }}</span>
                <input
                  #fld
                  class="input"
                  type="text"
                  autocomplete="off"
                  [attr.inputmode]="
                    field.type === 'number' || field.type === 'rating' || field.type === 'money'
                      ? 'decimal'
                      : null
                  "
                  [value]="d.fields[field.key] ?? ''"
                  (input)="patchField(field.key, fld.value)"
                />
              </label>
            }
          }

          <label class="field wide">
            <span>Enlace</span>
            <input
              #urlInput
              class="input"
              type="text"
              inputmode="url"
              autocomplete="off"
              placeholder="https://"
              [value]="d.url"
              (input)="patch('url', urlInput.value)"
            />
          </label>

          <label class="field wide">
            <span>Etiquetas (separadas por comas)</span>
            <input
              #tagsInput
              class="input"
              type="text"
              autocomplete="off"
              [value]="d.tags"
              (input)="patch('tags', tagsInput.value)"
            />
          </label>
        </form>
      }

      <ng-template #footer>
        <div class="foot">
          @if (error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <button type="button" class="btn danger" (click)="removed.emit(item()!)">Borrar</button>
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button type="submit" form="item-form" class="btn primary" [disabled]="saving()">
            Guardar
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ItemDialog {
  private readonly api = inject(ApiClient);

  /** Item to edit; `null` keeps the dialog closed. */
  readonly item = input<Item | null>(null);
  readonly list = input.required<List>();

  readonly saved = output<Item>();
  readonly closed = output<void>();
  readonly removed = output<Item>();

  protected readonly draft = signal<Draft | null>(null);
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly titleField = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  protected readonly titleInvalid = signal(false);
  /** Draft as it was when opened: with unsaved changes, a click outside does not close the dialog. */
  private readonly initial = signal('');
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.initial());

  constructor() {
    // Each time it opens with an item, the draft starts from its current values.
    effect(() => {
      const item = this.item();
      const list = this.list();
      this.error.set('');
      this.titleInvalid.set(false);
      const draft: Draft | null = item && {
        title: item.title,
        text: item.text ?? '',
        dueDate: item.dueDate ?? '',
        url: item.url ?? '',
        tags: item.tags.join(', '),
        column: item.column ?? '',
        fields: Object.fromEntries(
          list.fieldDefs.map((def) => [def.key, toInputValue(def, item.extra[def.key])]),
        ),
      };
      this.initial.set(JSON.stringify(draft));
      this.draft.set(draft);
    });
  }

  /** On open, focus goes to the title, except on touch: there it would open the keyboard and cover the form. */
  protected focusTitle(): void {
    if (!prefersNativePickers()) this.titleField()?.nativeElement.focus();
  }

  protected patch(key: Exclude<keyof Draft, 'fields'>, value: string): void {
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected patchField(key: string, value: string): void {
    this.draft.update((d) => (d ? { ...d, fields: { ...d.fields, [key]: value } } : d));
  }

  protected save(event: Event): void {
    event.preventDefault();
    const item = this.item();
    const d = this.draft();
    if (!item || !d || this.saving()) return;
    this.titleInvalid.set(false);
    if (!d.title.trim()) {
      this.error.set('El título no puede estar vacío');
      this.titleInvalid.set(true);
      this.titleField()?.nativeElement.focus();
      return;
    }
    const url = normalizeUrl(d.url);
    if (url === null) {
      this.error.set(
        'El enlace no es válido: debe ser una dirección web, como https://ejemplo.com',
      );
      return;
    }

    const extra: Extra = {};
    for (const def of this.list().fieldDefs) {
      const value = fromInputValue(def, d.fields[def.key] ?? '');
      if (value === undefined) {
        this.error.set(`Valor no válido en «${def.label}»`);
        return;
      }
      // Only send what changed or already existed (an empty field that did not exist is not needed).
      if (value !== null || item.extra[def.key] !== undefined) extra[def.key] = value;
    }

    const update: UpdateItem = {
      title: d.title.trim(),
      text: d.text.trim() || null,
      dueDate: d.dueDate || null,
      url: url || null,
      tags: d.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      extra,
      ...(d.column && d.column !== item.column && { column: d.column }),
    };
    this.error.set('');
    this.saving.set(true);
    this.api.updateItem(item.id, update).subscribe({
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
