import { Component, input, output } from '@angular/core';
import type { Extra, FieldDef, Item, List } from '@rayrecords/shared';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { TableModule } from 'primeng/table';
import { formatField } from './field-format';
import { shortDate, tagHue, todayLocal } from './board-logic';

/**
 * List view: one row per item, one column per field of the list. `p-table` is used for column
 * sorting (`aria-sort` and keyboard already handled) and horizontal scrolling on narrow screens;
 * editing happens in the shared dialog (`app-item-dialog`).
 */
@Component({
  selector: 'app-list-table',
  imports: [TableModule, CheckboxModule, FormsModule],
  styles: `
    .wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    /* Done: struck-through text; everything coloured (labels, link) turns neutral grey. */
    .done .title,
    .done td:not(.actions) {
      color: var(--muted);
    }

    .done .title {
      text-decoration: line-through;
    }

    .done .tag-chip {
      --hue: var(--muted);
      --hue-soft: var(--surface-2);
      --hue-text: var(--muted);
    }

    .done .link-icon {
      color: var(--muted);
    }

    /* Wide table: scrolls inside its box. On mobile columns are reduced and it is not needed. */
    :host ::ng-deep .p-datatable-table {
      min-width: 42rem;
    }

    .check-col {
      width: 44px;
    }

    .check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      cursor: pointer;
    }

    .title {
      padding: 0;
      border: 0;
      background: none;
      color: var(--text);
      font-weight: 500;
      text-align: left;
      cursor: pointer;

      &:hover {
        color: var(--accent);
      }
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }

    .actions {
      white-space: nowrap;
      text-align: right;
    }

    .overdue {
      color: var(--danger);
    }

    /* Row data under the title: mobile only, where the extra columns are hidden. */
    .mmeta {
      display: none;
    }

    .empty-row {
      padding: var(--space-5);
      color: var(--muted);
      text-align: center;
    }

    @media (width <= 767px) {
      :host ::ng-deep .p-datatable-table {
        min-width: 0;
      }

      .col-opt {
        display: none;
      }

      .mmeta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-2);
        margin-top: var(--space-1);
        color: var(--muted);
        font-size: var(--text-xs);
      }

      .check {
        width: var(--touch-target);
        height: var(--touch-target);
      }

      .actions .btn {
        min-width: var(--touch-target);
        min-height: var(--touch-target);
      }

      .title {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <div class="wrap">
      <p-table [value]="items()" [rowHover]="canHover">
        <ng-template #header>
          <tr>
            <th class="check-col"><span class="sr-only">Hecho</span></th>
            <th pSortableColumn="title">Título <p-sorticon field="title" /></th>
            @for (field of list().fieldDefs; track field.key) {
              <th
                class="col-opt"
                [pSortableColumn]="'extra.' + field.key"
                [class.num]="field.type === 'number' || field.type === 'money'"
              >
                {{ field.label }} <p-sorticon [field]="'extra.' + field.key" />
              </th>
            }
            <th class="col-opt" pSortableColumn="dueDate">Fecha <p-sorticon field="dueDate" /></th>
            <th class="col-opt">Etiquetas</th>
            <th><span class="sr-only">Acciones</span></th>
          </tr>
        </ng-template>

        <ng-template #body let-item>
          <tr [class.done]="item.doneAt">
            <td class="check-col">
              <label class="check">
                <p-checkbox
                  [binary]="true"
                  [ariaLabel]="'Hecho: ' + item.title"
                  [ngModel]="!!item.doneAt"
                  (onChange)="toggle.emit({ item, done: $event.checked })"
                />
              </label>
            </td>
            <td>
              <button type="button" class="title" (click)="edit.emit(item)">
                {{ item.title }}
              </button>
              @if (item.url) {
                <a
                  class="link-icon"
                  [href]="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  [attr.aria-label]="'Abrir el enlace de ' + item.title"
                  [title]="item.url"
                >
                  <i class="pi pi-external-link" aria-hidden="true"></i>
                </a>
              }
              <span class="mmeta">
                @if (item.dueDate) {
                  <span [class.overdue]="!item.doneAt && item.dueDate < today">
                    {{ date(item.dueDate) }}
                  </span>
                }
                @for (field of list().fieldDefs; track field.key) {
                  @if (show(field, item.extra); as value) {
                    <span>{{ value }}</span>
                  }
                }
                @for (tag of item.tags; track tag) {
                  <span [class]="'tag-chip hue-' + hue(tag)">{{ tag }}</span>
                }
              </span>
            </td>
            @for (field of list().fieldDefs; track field.key) {
              <td class="col-opt" [class.num]="field.type === 'number' || field.type === 'money'">
                @if (field.type === 'select' && show(field, item.extra); as value) {
                  <span [class]="'tag-chip hue-' + hue(value)">{{ value }}</span>
                } @else {
                  {{ show(field, item.extra) }}
                }
              </td>
            }
            <td
              class="col-opt"
              [class.overdue]="!item.doneAt && item.dueDate && item.dueDate < today"
            >
              {{ item.dueDate ? date(item.dueDate) : '' }}
            </td>
            <td class="col-opt">
              <span class="tags">
                @for (tag of item.tags; track tag) {
                  <span [class]="'tag-chip hue-' + hue(tag)">{{ tag }}</span>
                }
              </span>
            </td>
            <td class="actions">
              <button
                type="button"
                class="btn ghost sm icon"
                [attr.aria-label]="'Editar ' + item.title"
                (click)="edit.emit(item)"
              >
                <i class="pi pi-pencil" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="btn ghost sm icon danger"
                [attr.aria-label]="'Borrar ' + item.title"
                (click)="remove.emit(item)"
              >
                <i class="pi pi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        </ng-template>

        <ng-template #emptymessage>
          <tr>
            <td [attr.colspan]="list().fieldDefs.length + 5" class="empty-row">
              No hay elementos que mostrar.
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class ListTable {
  readonly list = input.required<List>();
  readonly items = input.required<Item[]>();

  readonly edit = output<Item>();
  readonly remove = output<Item>();
  readonly toggle = output<{ item: Item; done: boolean }>();

  protected readonly today = todayLocal();
  /** Row highlight only on devices with a cursor: on touch, `:hover` would stick. */
  protected readonly canHover =
    typeof matchMedia !== 'function' || !!matchMedia('(hover: hover)')?.matches;

  protected show(def: FieldDef, extra: Extra): string {
    return formatField(def, extra[def.key]);
  }

  protected hue(tag: string): string {
    return tagHue(tag);
  }

  protected date(iso: string): string {
    return shortDate(iso);
  }
}
