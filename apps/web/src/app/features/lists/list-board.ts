import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  CdkDrag,
  CdkDropList,
  CdkDropListGroup,
  type CdkDragDrop,
  type CdkDragStart,
} from '@angular/cdk/drag-drop';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { BoardColumn, Extra, FieldDef, Item, MoveItem } from '@rayrecords/shared';
import {
  columnHue,
  hueStyle,
  dropRequest,
  isOverdue,
  itemsInColumn,
  neighbourId,
  shiftRequest,
  shortDate,
  stepRequest,
  todayLocal,
} from './board-logic';
import { formatField } from './field-format';
import { Icon } from '../../core/ui/icon';
import { PriorityIcon } from './priority-icon';
import { StatusIcon, columnIcon } from './status-icon';
import { LEGACY_PRIORITY_KEY, priorityOf, type Priority } from './priority-logic';

/** The second line of a card: priority, a badge, up to two labels (and the rest), and extra fields. */
interface CardMeta {
  priority: Priority | null;
  badge: string | null;
  tags: string[];
  more: string[];
  extras: string;
}

/** Move a card: which card and where it ends up. Run (and saved) by whoever uses the board. */
export interface BoardMove {
  id: string;
  request: MoveItem;
}

/** Extras text of a card (priority, amount…), only those with a value. */
function extras(defs: readonly FieldDef[], extra: Extra): string {
  return defs
    .map((def) => formatField(def, extra[def.key]))
    .filter(Boolean)
    .join(' · ');
}

/**
 * Kanban board. Dragging uses `@angular/cdk/drag-drop` (mouse, pen and touch with an insertion gap)
 * and everything draggable can also be done with the keyboard or the buttons of the selected card:
 * J/K traverse, ←/→ change column, Alt+↑/↓ reorder, Space opens.
 */
@Component({
  selector: 'app-list-board',
  imports: [Icon, PriorityIcon, StatusIcon, CdkScrollable, CdkDrag, CdkDropList, CdkDropListGroup],
  styles: `
    :host {
      display: block;
    }

    .board {
      display: flex;
      align-items: flex-start;
      gap: var(--space-5);
      padding: 2px 2px var(--space-4);
      overflow-x: auto;
      overscroll-behavior-x: contain;
    }

    .column {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 260px;
      max-width: 360px;
    }

    .col-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) var(--space-1) 0;
      border-top: 3px solid var(--hue, var(--line-strong));
      border-radius: 2px;
    }

    .col-head h2 {
      font-size: var(--text-base);
    }

    /* The accent circle of the column. */

    .count {
      margin-left: 6px;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--hue-soft, var(--surface-2));
      color: var(--hue-text, var(--muted));
      font-size: var(--text-xs);
      font-weight: 500;
    }

    .krow {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--space-1) var(--space-2);
    }

    .cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 48px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .kcard {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      /* The pointing hand says the card can be opened; the grabbing one shows while it is held to drag. */
      cursor: pointer;
      transition:
        background-color 0.12s ease,
        border-color 0.12s ease;

      &:active {
        cursor: grab;
      }

      @media (hover: hover) {
        &:hover:not(.cdk-drag-placeholder, .cdk-drag-preview) {
          border-color: var(--line-strong);
          background: var(--row-hover);
        }
      }

      &.selected,
      &:has(.kbody:focus-visible) {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent);
      }

      /* Done: unobtrusive. Everything coloured turns neutral grey (contrast kept). */
      &.done {
        border-color: var(--line-soft);
      }
    }

    .done .tag-chip {
      --hue: var(--muted);
      --hue-soft: var(--surface-2);
      --hue-text: var(--muted);
    }

    .kbody {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      text-align: left;
      cursor: inherit;

      &:focus-visible {
        outline: none;
      }
    }

    .ktitle {
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .done .ktitle {
      color: var(--muted);
      text-decoration: line-through;
    }

    .kmeta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .overdue {
      color: var(--danger);
    }

    .add-card {
      padding: 12px 14px;
      border: 1.5px dashed var(--line-strong);
      border-radius: var(--radius-lg);
      background: none;
      color: var(--muted);
      font-size: var(--text-sm);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--surface-2);
        color: var(--text);
      }
    }

    .add-card {
      width: 100%;
    }

    .add-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .add-form small {
      color: var(--muted);
      font-size: var(--text-xs);
    }

    /* While dragging, the card's slot stays open as an empty dashed outline of the same size. */
    .cards .kcard.cdk-drag-placeholder {
      border: 1px dashed var(--line-strong);
      box-shadow: none;
      background: var(--surface-2);
      opacity: 1;

      > * {
        visibility: hidden;
      }
    }

    /* The card in the hand keeps its size and content (it is a clone), a little larger and lifted. */
    .kcard.cdk-drag-preview {
      border-color: var(--accent);
      box-shadow: var(--shadow-lg);
      scale: 1.02;
      cursor: grabbing;
      animation: lift 0.16s ease-out;
    }

    @keyframes lift {
      from {
        box-shadow: 0 0 0 0 transparent;
        scale: 1;
      }
    }

    .cards .kcard:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0.2, 0, 0, 1);
    }

    @media (prefers-reduced-motion: reduce) {
      .cards .kcard:not(.cdk-drag-placeholder) {
        transition: none;
      }

      .kcard.cdk-drag-preview {
        animation: none;
      }
    }

    /* While a card is being dragged every column is a tall drop area. */
    .column {
      position: relative;
    }

    .status {
      margin-right: var(--space-2);
      vertical-align: -0.2em;
    }

    /* The list of cards: the drop area covers this and not the header. */
    .lane {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--space-3);
    }

    .board.dragging .column {
      min-height: 320px;
    }

    .board.dragging .cards {
      flex: 1 1 auto;
    }

    /* The column the card would go to: blurred, with the invitation to drop it. */
    .drop-zone {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      padding: var(--space-4);
      border: 1.5px dashed var(--hue, var(--line-strong));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--surface) 72%, transparent);
      backdrop-filter: blur(4px);
      color: var(--muted);
      font-size: var(--text-sm);
      text-align: center;
      pointer-events: none;

      strong {
        color: var(--text);
        font-size: var(--text-base);
      }
    }

    .slot {
      box-sizing: border-box;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-lg);
      background: var(--surface-2);
      list-style: none;
    }

    .column.receiving .cdk-drag-placeholder {
      display: none;
    }

    .more {
      position: relative;
      cursor: default;
    }

    .more .pop {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      z-index: 5;
      display: none;
      flex-wrap: wrap;
      gap: var(--space-1);
      width: max-content;
      max-width: 220px;
      padding: var(--space-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }

    .more:hover .pop {
      display: flex;
    }

    .hints {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-5);
      padding-top: var(--space-3);
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .hints .end {
      margin-left: auto;
    }

    @media (width <= 767px), (pointer: coarse) {
      .hints {
        display: none;
      }
    }

    @media (width <= 767px) {
      .board {
        gap: var(--space-3);
        scroll-padding-inline: 2px;
        scroll-snap-type: x mandatory;
      }

      .column {
        flex: 0 0 84%;
        scroll-snap-align: start;
      }

      .col-head .btn {
        min-width: var(--touch-target);
        min-height: var(--touch-target);
      }

      .add-card {
        min-height: var(--touch-target);
      }

      .kcard {
        cursor: default;
      }
    }
  `,
  template: `
    <div
      class="board"
      [class.dragging]="drag() !== null"
      cdkScrollable
      cdkDropListGroup
      role="group"
      aria-label="Tablero"
      (keydown)="onKeydown($event)"
    >
      @for (column of columns(); track column.key; let ci = $index) {
        @let view = views()[ci]!;
        <section
          class="column"
          [class]="'column hue-' + view.hue"
          [style]="view.style"
          [class.receiving]="receiving(column.key)"
          [attr.aria-labelledby]="'col-' + column.key"
        >
          <header class="col-head">
            <h2 [id]="'col-' + column.key">
              <app-status-icon class="status" [kind]="view.icon" />{{ column.label }}
              <span class="count">{{ cardsOf(column.key).length }}</span>
            </h2>
            <button
              type="button"
              class="btn ghost sm icon"
              [attr.aria-label]="'Añadir tarjeta en ' + column.label"
              (click)="startAdd(column.key)"
            >
              <app-icon name="plus" />
            </button>
          </header>

          <div class="lane">
            <ul
              class="cards"
              cdkDropList
              [cdkDropListData]="column.key"
              [cdkDropListDisabled]="dragOff()"
              [attr.aria-label]="'Tarjetas de ' + column.label"
              (cdkDropListDropped)="drop($event)"
              [cdkDropListSortingDisabled]="sortingOff(column.key)"
              (cdkDropListEntered)="enter(column.key)"
            >
              @for (item of cardsOf(column.key); track item.id; let i = $index; let last = $last) {
                <li
                  class="kcard"
                  cdkDrag
                  [cdkDragData]="item"
                  [cdkDragDisabled]="dragOff()"
                  [class.selected]="item.id === openId()"
                  [class.done]="item.doneAt"
                  (cdkDragStarted)="onDragStart($event, column.key, item.id)"
                  (cdkDragEnded)="drag.set(null)"
                >
                  <button
                    type="button"
                    class="kbody"
                    [attr.data-card]="item.id"
                    [tabindex]="item.id === rovingId() ? 0 : -1"
                    [attr.aria-label]="item.title"
                    (focus)="selectedId.set(item.id)"
                    (click)="open.emit(item)"
                  >
                    <span class="krow">
                      <span class="ktitle">{{ item.title }}</span>
                    </span>
                    @if (metaOf(item.id); as meta) {
                      <span class="kmeta">
                        @if (meta.priority; as priority) {
                          <app-priority-icon [priority]="priority" />
                        }
                        @if (meta.badge; as badge) {
                          <span class="tag-chip">{{ badge }}</span>
                        }
                        @for (tag of meta.tags; track tag) {
                          <span class="tag-chip">{{ tag }}</span>
                        }
                        @if (meta.more.length > 0) {
                          <span class="tag-chip more" [attr.aria-label]="meta.more.join(', ')"
                            >+{{ meta.more.length }}
                            <span class="pop" aria-hidden="true">
                              @for (tag of meta.more; track tag) {
                                <span class="tag-chip">{{ tag }}</span>
                              }
                            </span>
                          </span>
                        }
                        @if (item.doneAt) {
                          <span>{{ date(item.doneAt) }}</span>
                        } @else if (item.dueDate) {
                          <span [class.overdue]="overdue(item)"
                            >vence {{ date(item.dueDate) }}</span
                          >
                        }
                        @if (meta.extras; as text) {
                          <span>{{ text }}</span>
                        }
                      </span>
                    }
                  </button>
                </li>
                @if (item.id === drag()?.id && leaving()) {
                  <li class="slot" aria-hidden="true" [style.height.px]="drag()?.height"></li>
                }
              }
            </ul>

            @if (receiving(column.key)) {
              <div class="drop-zone" aria-hidden="true">
                <strong>Suelta la tarea aquí</strong>
                <span>para cambiar su estado a «{{ column.label }}»</span>
              </div>
            }
          </div>

          @if (adding() === column.key) {
            <form class="add-form" (submit)="submitAdd($event, column.key)">
              <input
                #addInput
                class="input"
                type="text"
                autocomplete="off"
                [attr.aria-label]="'Título de la nueva tarjeta en ' + column.label"
                placeholder="Título de la tarjeta"
                [value]="newTitle()"
                (input)="newTitle.set(addInput.value)"
                (keydown.escape)="cancelAdd()"
                (blur)="blurAdd()"
              />
              <small>Intro para añadir · Esc para cerrar</small>
            </form>
          } @else {
            <button type="button" class="add-card" (click)="startAdd(column.key)">
              + Añadir tarjeta
            </button>
          }
        </section>
      }
    </div>

    <p class="hints">
      <span><span class="kbd">J</span> / <span class="kbd">K</span> moverse</span>
      <span><span class="kbd">←</span> / <span class="kbd">→</span> mover tarjeta de columna</span>
      <span
        ><span class="kbd">Alt</span> + <span class="kbd">↑</span> /
        <span class="kbd">↓</span> ordenar</span
      >
      <span><span class="kbd">Espacio</span> abrir</span>
      <span><span class="kbd">N</span> nueva tarjeta</span>
      <span class="end">Todo se guarda solo</span>
    </p>
  `,
})
export class ListBoard {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly columns = input.required<BoardColumn[]>();
  readonly items = input.required<Item[]>();
  readonly fieldDefs = input<FieldDef[]>([]);
  /** The card whose detail is open: it is the one shown as selected. */
  readonly openId = input<string | null>(null);

  readonly move = output<BoardMove>();
  readonly add = output<{ column: string; title: string }>();
  readonly open = output<Item>();
  readonly remove = output<Item>();

  protected readonly selectedId = signal<string | null>(null);
  protected readonly adding = signal<string | null>(null);
  protected readonly newTitle = signal('');
  /** Column the dragged card is over (for the ghost card text). */
  /** The card being dragged: where it comes from, the column it is over and its height. */
  protected readonly drag = signal<{
    id: string;
    from: string;
    over: string;
    height: number;
  } | null>(null);

  /** The dragged card is over a column that is not its own: its slot here stays open. */
  protected leaving(): boolean {
    const drag = this.drag();
    return !!drag && drag.over !== drag.from;
  }

  /** Only the column the card comes from sorts: the others show the drop invitation. */
  protected sortingOff(column: string): boolean {
    const drag = this.drag();
    return !!drag && drag.from !== column;
  }

  protected enter(column: string): void {
    this.drag.update((drag) => drag && { ...drag, over: column });
  }

  protected onDragStart(event: CdkDragStart<Item>, column: string, id: string): void {
    const element = event.source.getPlaceholderElement() ?? event.source.element.nativeElement;
    this.drag.set({
      id,
      from: column,
      over: column,
      height: element.getBoundingClientRect().height,
    });
  }

  /** The column a dragged card would change to: it shows the drop invitation. */
  protected receiving(column: string): boolean {
    const drag = this.drag();
    return !!drag && drag.over === column && column !== drag.from;
  }

  /** On mobile and touch screens dragging is disabled: the board scrolls there and buttons are used. */
  protected readonly dragOff = signal(false);

  private readonly today = todayLocal();

  protected readonly cards = computed(() => {
    const items = this.items();
    return new Map(this.columns().map((c) => [c.key, itemsInColumn(items, c.key)]));
  });

  /** Card that receives focus with Tab: the selected one or, if none, the first. */
  protected readonly rovingId = computed(() => {
    const selected = this.selectedId();
    if (selected && this.items().some((i) => i.id === selected)) return selected;
    return neighbourId(this.items(), this.columns(), null, 1);
  });

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(max-width: 767px), (pointer: coarse)');
      this.dragOff.set(query.matches);
      query.addEventListener('change', (event) => this.dragOff.set(event.matches));
    }
  }

  protected cardsOf(column: string): Item[] {
    return this.cards().get(column) ?? [];
  }

  /** What a column looks like: its colour, its style when the colour is RGB and its state icon. */
  protected readonly views = computed(() =>
    this.columns().map((column, index) => ({
      hue: columnHue(column.label, index, column.color),
      style: hueStyle(column.color),
      icon: columnIcon(column, index, this.columns().length),
    })),
  );

  /**
   * The second line of each card (priority, badge, labels, extras), worked out once per change and
   * not once per card on every pass; cards with nothing to show have no entry.
   */
  private readonly metas = computed(() => {
    const defs = this.fieldDefs().filter((def) => def.key !== LEGACY_PRIORITY_KEY);
    // The first «select» field acts as a grey badge on the card.
    const badge = defs.find((def) => def.type === 'select');
    const rest = defs.filter((def) => def !== badge);
    const metas = new Map<string, CardMeta>();
    for (const item of this.items()) {
      const value = badge ? item.extra[badge.key] : undefined;
      const meta: CardMeta = {
        priority: priorityOf(item),
        badge: typeof value === 'string' && value !== '' ? value : null,
        tags: item.tags.slice(0, 2),
        more: item.tags.slice(2),
        extras: extras(rest, item.extra),
      };
      const empty = !meta.priority && !meta.badge && !item.tags.length && !meta.extras;
      if (!empty || item.dueDate || item.doneAt) metas.set(item.id, meta);
    }
    return metas;
  });

  protected metaOf(id: string): CardMeta | undefined {
    return this.metas().get(id);
  }

  protected date(iso: string): string {
    return shortDate(iso);
  }

  protected overdue(item: Item): boolean {
    return isOverdue(item.dueDate, this.today);
  }

  protected drop(event: CdkDragDrop<string, string, Item>): void {
    this.drag.set(null);
    const item = event.item.data;
    const column = event.container.data;
    const sameColumn = event.previousContainer === event.container;
    if (sameColumn && event.previousIndex === event.currentIndex) return;
    this.selectedId.set(item.id);
    this.move.emit({
      id: item.id,
      request: dropRequest(
        this.items(),
        item.id,
        column,
        // Into another column the card goes to the end of it.
        sameColumn ? event.currentIndex : this.cardsOf(column).length,
      ),
    });
    this.focusCard(item.id);
  }

  protected shift(item: Item, direction: -1 | 1): void {
    const request = shiftRequest(this.items(), this.columns(), item.id, direction);
    if (!request) return;
    this.move.emit({ id: item.id, request });
    this.focusCard(item.id);
  }

  protected step(item: Item, direction: -1 | 1): void {
    const request = stepRequest(this.items(), item.id, direction);
    if (!request) return;
    this.move.emit({ id: item.id, request });
    this.focusCard(item.id);
  }

  /** Keyboard: only acts with focus on a card (does not interfere with text fields). */
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>('[data-card]')?.dataset['card'];
    if (!id || event.ctrlKey || event.metaKey) return;
    const item = this.items().find((i) => i.id === id);
    if (!item) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const handled = (): void => event.preventDefault();

    if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      handled();
      this.step(item, key === 'ArrowUp' ? -1 : 1);
    } else if (event.altKey) {
      return;
    } else if (key === 'j' || key === 'ArrowDown' || key === 'k' || key === 'ArrowUp') {
      handled();
      const next = neighbourId(
        this.items(),
        this.columns(),
        id,
        key === 'j' || key === 'ArrowDown' ? 1 : -1,
      );
      if (next) this.focusCard(next);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      handled();
      this.shift(item, key === 'ArrowLeft' ? -1 : 1);
    } else if (key === ' ' || key === 'Enter') {
      handled();
      this.open.emit(item);
    } else if (key === 'n') {
      handled();
      this.startAdd(item.column ?? this.columns()[0]?.key ?? '');
    } else if (key === 'Delete') {
      handled();
      this.remove.emit(item);
    }
  }

  /** Gives focus back to a card (after rendering, since changing column recreates it). */
  focusCard(id: string | null = this.selectedId()): void {
    if (!id) return;
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-card="${id}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  /** Opens the new-card field of a column (the first one by default). */
  startAdd(column: string = this.columns()[0]?.key ?? ''): void {
    this.newTitle.set('');
    this.adding.set(column);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>('.add-form input')?.focus(),
      { injector: this.injector },
    );
  }

  protected submitAdd(event: Event, column: string): void {
    event.preventDefault();
    const title = this.newTitle().trim();
    if (!title) return;
    this.add.emit({ column, title });
    this.newTitle.set('');
  }

  protected cancelAdd(): void {
    this.adding.set(null);
    this.newTitle.set('');
  }

  /** Leaving the field with text typed does not lose it: it only closes if empty. */
  protected blurAdd(): void {
    if (!this.newTitle().trim()) this.adding.set(null);
  }
}
