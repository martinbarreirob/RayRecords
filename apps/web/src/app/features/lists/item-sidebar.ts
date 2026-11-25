import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { BoardColumn, ColumnIcon, Item, UpdateItem } from '@rayrecords/shared';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { BottomSheet, type SheetState } from '../../core/ui/bottom-sheet';
import { Dropdown } from '../../core/ui/dropdown';
import { Icon } from '../../core/ui/icon';
import { injectIsPhone } from '../../core/ui/viewport';
import { columnHue, hueStyle } from './board-logic';
import { PriorityIcon } from './priority-icon';
import { StatusIcon, columnIcon } from './status-icon';
import {
  LEGACY_PRIORITY_KEY,
  PRIORITIES,
  PRIORITY_LABELS,
  priorityOf,
  type Priority,
} from './priority-logic';

/** Where the section content is on screen: the panel lies over it and never over the header. */
interface Area {
  top: number;
  right: number;
  width: number;
}

/**
 * A card of a board opened for editing, laid out like an issue in Linear: the title and the
 * description on the left, the properties on the right (state, labels, done, more details) and
 * the delete button at the very end. On a desktop it is a panel over the right side of the
 * section content (the header stays free) and a click outside closes it; on a phone it is a
 * sheet that rises from the bottom. The title and the description are saved when they lose the
 * focus and when it closes.
 */
@Component({
  selector: 'app-item-sidebar',
  imports: [NgTemplateOutlet, Dropdown, BottomSheet, Icon, PriorityIcon, StatusIcon],
  host: {
    '(keydown.escape)': 'close($event)',
    '(window:resize)': 'measure()',
  },
  styles: `
    .backdrop {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: var(--z-popover);
    }

    .panel {
      position: fixed;
      bottom: 0;
      z-index: var(--z-popover);
      box-sizing: border-box;
      overflow: auto;
      border-left: 1px solid var(--line);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      animation: slide-in 0.22s cubic-bezier(0.2, 0, 0, 1);

      &.leaving {
        animation: slide-out 0.16s ease-in forwards;
        pointer-events: none;
      }
    }

    @keyframes slide-out {
      to {
        transform: translateX(24px);
        opacity: 0;
      }
    }

    @keyframes slide-in {
      from {
        transform: translateX(24px);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
    }

    .content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 232px;
      min-height: 100%;
    }

    .sheet-body {
      padding: var(--space-3) var(--space-4) var(--space-5);
    }

    .main {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-width: 0;
      padding: var(--space-5);
    }

    .title {
      width: 100%;
      padding: var(--space-1) 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: var(--text-xl);
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .description {
      flex: 1 1 auto;
      min-height: 220px;
      padding: 0;
      border: 0;
      outline: 0;
      resize: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      line-height: 1.55;
    }

    .props {
      color: color-mix(in srgb, var(--text) 72%, var(--muted));
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-5) var(--space-4);
      border-left: 1px solid var(--line);
      background: var(--surface);
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .label {
      margin-bottom: var(--space-1);
      color: var(--muted);
      font-size: var(--text-xs);
      font-weight: 500;
    }

    .option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: var(--control-height);
      padding: 0 var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--row-hover);
      }

      &[aria-pressed='true'] {
        background: var(--hue-soft, var(--surface));
        color: var(--hue-text, var(--text));
        font-weight: 500;
      }

      .tick {
        margin-left: auto;
      }
    }

    /* The labels go one under the other, a little larger than on a card. */
    /* The labels fill the space there is, one after another, and the "+" comes last. */
    .tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .tags .tag-chip {
      padding: 2px var(--space-1) 2px var(--space-3);
      border-radius: var(--radius-pill);
      color: inherit;
      font-size: var(--text-sm);
    }

    .add-tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: transparent;
      color: inherit;
      cursor: pointer;

      &:hover {
        background: var(--row-hover);
      }
    }

    .tag-input {
      width: 150px;
      min-height: 28px;
      padding-block: 0;
    }

    /* The chip is the shared .tag-chip; the button takes the place of its end. */
    .tag-chip button {
      display: inline-flex;
      padding: 1px;
      border: 0;
      border-radius: 3px;
      background: none;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;

      &:hover {
        opacity: 1;
      }
    }

    /* A select that reads as a property: the value with its icon, the options open under it. */

    .props-list app-dropdown {
      align-self: flex-start;
    }

    .end {
      margin-top: auto;
    }

    .no-priority {
      width: 1.2em;
      height: 1.2em;
      border: 1.5px dashed var(--line-strong);
      border-radius: 50%;
    }

    .choice {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }

    .error {
      margin: 0;
    }

    @media (width <= 767px) {
      .content {
        grid-template-columns: minmax(0, 1fr);
      }

      .main {
        padding: 0;
      }

      .props {
        gap: var(--space-4);
        margin-top: var(--space-4);
        padding: var(--space-4) 0 0;
        border-top: 1px solid var(--line-soft);
        border-left: 0;
        background: transparent;
      }

      .option {
        min-height: var(--touch-target);
      }

      .title {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <ng-template #content>
      <div class="content" (mousedown)="releaseFocus($event)">
        <div class="main">
          <input
            #titleInput
            class="title"
            type="text"
            autocomplete="off"
            maxlength="300"
            aria-label="Título"
            [value]="title()"
            (input)="title.set(titleInput.value)"
            (blur)="commit(); titleInput.value = title()"
          />

          <textarea
            #descriptionInput
            class="description"
            aria-label="Descripción"
            placeholder="Añade una descripción: detalles, enlaces, lo que haga falta…"
            [value]="text()"
            (input)="text.set(descriptionInput.value)"
            (blur)="commit()"
          ></textarea>

          @if (error(); as message) {
            <p class="alert error" role="alert">{{ message }}</p>
          }
        </div>

        <div class="props">
          <div class="group props-list">
            <span class="label">Properties</span>
            <app-dropdown label="Cambiar el estado">
              <span trigger [class]="'choice hue-' + state().hue" [style]="state().style">
                <app-status-icon [kind]="state().icon" />{{ state().label }}
              </span>
              <div panel class="dd-menu" role="listbox" aria-label="Estado">
                @for (column of columns(); track column.key; let i = $index) {
                  <button
                    type="button"
                    data-pick
                    role="option"
                    [class]="'dd-opt hue-' + hue(column, i)"
                    [style]="hueStyle(column.color)"
                    [attr.aria-selected]="item().column === column.key"
                    (click)="moveTo.emit(column.key)"
                  >
                    <app-status-icon [kind]="iconOf(column, i)" />{{ column.label }}
                  </button>
                }
              </div>
            </app-dropdown>
            <app-dropdown label="Cambiar la prioridad">
              <span trigger class="choice">
                @if (priority(); as value) {
                  <app-priority-icon [priority]="value" />
                } @else {
                  <span class="no-priority" aria-hidden="true"></span>
                }
                {{ priority() ? labels[priority()!] : 'Sin prioridad' }}
              </span>
              <div panel class="dd-menu" role="listbox" aria-label="Prioridad">
                @for (option of priorityOptions; track option.label) {
                  <button
                    type="button"
                    data-pick
                    role="option"
                    class="dd-opt"
                    [attr.aria-selected]="option.value === priority()"
                    (click)="setPriority(option.value)"
                  >
                    @if (option.value) {
                      <app-priority-icon [priority]="option.value" />
                    } @else {
                      <span class="no-priority" aria-hidden="true"></span>
                    }
                    {{ option.label }}
                  </button>
                }
              </div>
            </app-dropdown>
          </div>

          <div class="group">
            <span class="label" id="labels-label">Etiquetas</span>
            <div class="tags" role="list" aria-labelledby="labels-label">
              @for (tag of item().tags; track tag) {
                <span class="tag-chip" role="listitem"
                  >{{ tag }}
                  <button
                    type="button"
                    [attr.aria-label]="'Quitar la etiqueta ' + tag"
                    (click)="removeTag(tag)"
                  >
                    <app-icon name="x" />
                  </button>
                </span>
              }
              @if (addingTag()) {
                <input
                  #tagInput
                  class="input tag-input"
                  type="text"
                  autocomplete="off"
                  maxlength="40"
                  aria-label="Añadir etiqueta"
                  placeholder="Etiqueta y Intro"
                  (keydown.enter)="
                    addTag(tagInput.value); tagInput.value = ''; $event.preventDefault()
                  "
                  (keydown.escape)="stopAddTag($event)"
                  (blur)="addingTag.set(false)"
                />
              } @else {
                <button
                  type="button"
                  class="add-tag"
                  aria-label="Añadir etiqueta"
                  (click)="addingTag.set(true)"
                >
                  <app-icon name="plus" />
                </button>
              }
            </div>
          </div>

          <button type="button" class="btn danger end" (click)="remove.emit()">
            <app-icon name="trash" />
            Eliminar
          </button>
        </div>
      </div>
    </ng-template>

    @if (phone()) {
      <app-bottom-sheet label="Editar tarjeta" [collapsible]="false" [(state)]="sheet">
        <span sheetHeader>Tarjeta</span>
        <div class="sheet-body">
          <ng-container *ngTemplateOutlet="content" />
        </div>
      </app-bottom-sheet>
    } @else {
      <div
        class="backdrop"
        aria-hidden="true"
        [class.leaving]="leaving()"
        [style.top.px]="area().top"
        (click)="close($event)"
      ></div>
      <aside
        class="panel"
        [class.leaving]="leaving()"
        aria-label="Editar tarjeta"
        [style.top.px]="area().top"
        [style.right.px]="area().right"
        [style.width.px]="area().width"
      >
        <ng-container *ngTemplateOutlet="content" />
      </aside>
    }
  `,
})
export class ItemSidebar {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  readonly item = input.required<Item>();
  readonly columns = input<BoardColumn[]>([]);

  readonly moveTo = output<string>();
  readonly remove = output<void>();
  readonly closed = output<void>();

  protected readonly phone = injectIsPhone();
  protected readonly sheet = signal<SheetState>('expanded');
  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly error = signal('');
  /** The field to type a new label shows after pressing the "+" button. */
  protected readonly addingTag = signal(false);
  /** The panel is sliding out: it tells its owner once it is gone. */
  protected readonly leaving = signal(false);
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly tagField = viewChild<ElementRef<HTMLInputElement>>('tagInput');
  protected readonly priority = computed(() => priorityOf(this.item()));
  protected readonly labels = PRIORITY_LABELS;
  protected readonly priorityOptions: { value: Priority | null; label: string }[] = [
    { value: null, label: 'Sin prioridad' },
    ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  ];
  protected readonly state = computed(() => {
    const index = this.columns().findIndex((column) => column.key === this.item().column);
    const column = this.columns()[index];
    return {
      label: column?.label ?? 'Sin estado',
      hue: column ? this.hue(column, index) : 'blue',
      style: column ? hueStyle(column.color) : null,
      icon: column ? this.iconOf(column, index) : ('todo' as ColumnIcon),
    };
  });
  protected readonly area = signal<Area>({ top: 0, right: 0, width: 560 });

  /** The card the fields were filled from: a change of card saves the previous one first. */
  private current: Item | null = null;

  constructor() {
    effect(() => {
      const item = this.item();
      untracked(() => this.show(item));
    });
    // The sheet closes with a drag, its backdrop or Escape: the panel's close is the same.
    effect(() => {
      if (this.sheet() === 'closed') untracked(() => this.closed.emit());
    });
    // The field takes the focus as soon as it appears.
    effect(() => this.tagField()?.nativeElement.focus());
    this.measure();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.leaveTimer);
      this.commit();
    });
  }

  /** Places the panel over the content of the section (the scrolling area under the header). */
  protected measure(): void {
    if (this.phone()) return;
    const main = typeof document === 'undefined' ? null : document.querySelector('main');
    if (!main) return;
    const rect = main.getBoundingClientRect();
    this.area.set({
      top: Math.max(0, rect.top),
      right: Math.max(0, window.innerWidth - rect.right),
      width: Math.min(720, rect.width),
    });
  }

  /** Fills the fields from the card; the same card again (after a reload) leaves what is typed. */
  private show(item: Item): void {
    if (this.current && this.current.id === item.id) {
      this.current = item;
      return;
    }
    this.commit();
    this.current = item;
    this.title.set(item.title);
    this.text.set(item.text ?? '');
    this.error.set('');
  }

  protected readonly hueStyle = hueStyle;

  protected hue(column: BoardColumn, index: number): string {
    return columnHue(column.label, index, column.color);
  }

  protected iconOf(column: BoardColumn, index: number): ColumnIcon {
    return columnIcon(column, index, this.columns().length);
  }

  protected setPriority(value: Priority | null): void {
    const legacy: Record<string, null> =
      LEGACY_PRIORITY_KEY in this.item().extra ? { [LEGACY_PRIORITY_KEY]: null } : {};
    this.patch(this.item().id, { extra: { priority: value, ...legacy } });
  }

  /** A press on empty space of the panel takes the focus out of the text being edited. */
  protected releaseFocus(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, button, .p-select')) return;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  protected addTag(value: string): void {
    const tag = value.trim().toLowerCase().slice(0, 40);
    const tags = this.item().tags;
    if (!tag || tags.includes(tag)) return;
    this.patch(this.item().id, { tags: [...tags, tag] });
  }

  protected stopAddTag(event: Event): void {
    event.stopPropagation();
    this.addingTag.set(false);
  }

  protected removeTag(tag: string): void {
    this.patch(this.item().id, { tags: this.item().tags.filter((t) => t !== tag) });
  }

  /** Saves a change of the card and tells the other screens; `onSaved` runs when it went through. */
  private patch(id: string, update: UpdateItem, onSaved?: () => void): void {
    this.api.updateItem(id, update).subscribe({
      next: () => {
        onSaved?.();
        this.error.set('');
        this.bus.changed();
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  /** Saves the title and the description if they changed; an empty title goes back to the old one. */
  protected commit(): void {
    const item = this.current;
    if (!item) return;
    const title = this.title().trim();
    const text = this.text().trim();
    if (!title) {
      this.title.set(item.title);
      return;
    }
    if (title === item.title && text === (item.text ?? '')) return;
    this.patch(item.id, { title, text: text || null }, () => {
      // The saved values are now the card's, so leaving it does not save them again.
      const saved: Item = { ...item, title };
      if (text) saved.text = text;
      else delete saved.text;
      this.current = saved;
    });
  }

  protected close(event: Event): void {
    event.stopPropagation();
    this.commit();
    this.dismiss();
  }

  /** Slides out (on a desktop, unless motion is reduced) and then says it is closed. */
  private dismiss(): void {
    if (this.leaving()) return;
    const still =
      this.phone() ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (still) {
      this.closed.emit();
      return;
    }
    this.leaving.set(true);
    this.leaveTimer = setTimeout(() => this.closed.emit(), 160);
  }
}
