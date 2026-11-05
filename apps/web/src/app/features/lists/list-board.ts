import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  CdkDrag,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup,
  type CdkDragDrop,
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
import { FormsModule } from '@angular/forms';
import type { BoardColumn, Extra, FieldDef, Item, MoveItem } from '@rayrecords/shared';
import { SelectModule } from 'primeng/select';
import {
  columnHue,
  dropRequest,
  isOverdue,
  itemsInColumn,
  moveToRequest,
  neighbourId,
  shiftRequest,
  shortDate,
  stepRequest,
  tagHue,
  todayLocal,
} from './board-logic';
import { formatField } from './field-format';

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
  imports: [
    CdkScrollable,
    CdkDrag,
    CdkDragPlaceholder,
    CdkDragPreview,
    CdkDropList,
    CdkDropListGroup,
    FormsModule,
    SelectModule,
  ],
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
      cursor: grab;

      &.selected {
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

    .ktext {
      display: -webkit-box;
      overflow: hidden;
      color: var(--muted);
      font-size: var(--text-sm);
      line-height: 1.5;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
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

    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      margin: 0 calc(var(--space-1) * -1);
      padding-top: var(--space-1);
      border-top: 1px solid var(--line);
    }

    /* «Mover a…»: alternative to dragging on touch; takes its own row. */
    .move-to {
      flex: 1 1 100%;
      margin: var(--space-1) var(--space-1) 0;
    }

    .add-card,
    .add-column {
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

    .side {
      flex: none;
      width: 140px;
      padding-top: 34px;
    }

    .insert-line {
      height: 3px;
      margin: -2px var(--space-1);
      border-radius: 2px;
      background: var(--accent);
    }

    .kpreview {
      box-sizing: border-box;
    }

    .kpreview-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px;
      border: 1.5px solid var(--accent);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      transform: rotate(2deg);
      font-size: var(--text-base);
    }

    .kpreview-card strong {
      font-weight: 500;
    }

    .kpreview-card small {
      color: var(--accent);
      font-size: var(--text-xs);
    }

    .kpreview.cdk-drag-animating {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }

    .cards.cdk-drop-list-dragging .kcard:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
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

      .side {
        flex: 0 0 120px;
        scroll-snap-align: end;
      }

      .tools .btn,
      .col-head .btn {
        min-width: var(--touch-target);
        min-height: var(--touch-target);
      }

      .add-card,
      .add-column {
        min-height: var(--touch-target);
      }

      .kcard {
        cursor: default;
      }

      .move-to ::ng-deep .p-select {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <div
      class="board"
      cdkScrollable
      cdkDropListGroup
      role="group"
      aria-label="Tablero"
      (keydown)="onKeydown($event)"
    >
      @for (column of columns(); track column.key; let ci = $index) {
        <section
          class="column"
          [class]="'column hue-' + hue(column.label, ci)"
          [attr.aria-labelledby]="'col-' + column.key"
        >
          <header class="col-head">
            <h2 [id]="'col-' + column.key">
              {{ column.label }} <span class="count">{{ cardsOf(column.key).length }}</span>
            </h2>
            <button
              type="button"
              class="btn ghost sm icon"
              [attr.aria-label]="'Añadir tarjeta en ' + column.label"
              (click)="startAdd(column.key)"
            >
              <i class="pi pi-plus" aria-hidden="true"></i>
            </button>
          </header>

          <ul
            class="cards"
            cdkDropList
            [cdkDropListData]="column.key"
            [cdkDropListDisabled]="dragOff()"
            [attr.aria-label]="'Tarjetas de ' + column.label"
            (cdkDropListDropped)="drop($event)"
            (cdkDropListEntered)="hoverColumn.set(column.label)"
          >
            @for (item of cardsOf(column.key); track item.id; let i = $index; let last = $last) {
              <li
                class="kcard"
                cdkDrag
                [cdkDragData]="item"
                [cdkDragDisabled]="dragOff()"
                [class.selected]="item.id === selectedId()"
                [class.done]="item.doneAt"
                (cdkDragStarted)="hoverColumn.set(column.label)"
              >
                <div *cdkDragPlaceholder class="insert-line"></div>
                <div *cdkDragPreview matchSize class="kpreview">
                  <div class="kpreview-card">
                    <strong>{{ item.title }}</strong>
                    <small>Arrastrando a «{{ hoverColumn() }}»</small>
                  </div>
                </div>

                <button
                  type="button"
                  class="kbody"
                  [attr.data-card]="item.id"
                  [tabindex]="item.id === rovingId() ? 0 : -1"
                  [attr.aria-label]="item.title"
                  (focus)="selectedId.set(item.id)"
                  (dblclick)="open.emit(item)"
                >
                  <span class="krow">
                    <span class="ktitle">{{ item.title }}</span>
                    @if (leadOf(item); as lead) {
                      <span [class]="'tag-chip hue-' + tagColor(lead)">{{ lead }}</span>
                    }
                  </span>
                  @if (item.text) {
                    <span class="ktext">{{ item.text }}</span>
                  }
                  @if (restTags(item).length || item.dueDate || item.doneAt || extrasOf(item)) {
                    <span class="kmeta">
                      @for (tag of restTags(item); track tag) {
                        <span [class]="'tag-chip hue-' + tagColor(tag)">{{ tag }}</span>
                      }
                      @if (item.doneAt) {
                        <span>{{ date(item.doneAt) }}</span>
                      } @else if (item.dueDate) {
                        <span [class.overdue]="overdue(item)">vence {{ date(item.dueDate) }}</span>
                      }
                      @if (extrasOf(item); as text) {
                        <span>{{ text }}</span>
                      }
                    </span>
                  }
                </button>

                @if (item.id === selectedId()) {
                  <div class="tools" role="group" [attr.aria-label]="'Acciones de ' + item.title">
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      aria-label="Mover a la columna anterior"
                      title="Columna anterior (←)"
                      [disabled]="!canShift(item, -1)"
                      (click)="shift(item, -1)"
                    >
                      <i class="pi pi-arrow-left" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      aria-label="Mover a la columna siguiente"
                      title="Columna siguiente (→)"
                      [disabled]="!canShift(item, 1)"
                      (click)="shift(item, 1)"
                    >
                      <i class="pi pi-arrow-right" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      aria-label="Subir en la columna"
                      title="Subir (Alt ↑)"
                      [disabled]="i === 0"
                      (click)="step(item, -1)"
                    >
                      <i class="pi pi-arrow-up" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      aria-label="Bajar en la columna"
                      title="Bajar (Alt ↓)"
                      [disabled]="last"
                      (click)="step(item, 1)"
                    >
                      <i class="pi pi-arrow-down" aria-hidden="true"></i>
                    </button>
                    <span class="spacer"></span>
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      [attr.aria-label]="
                        item.doneAt ? 'Marcar como pendiente' : 'Marcar como hecha'
                      "
                      [title]="item.doneAt ? 'Marcar como pendiente' : 'Marcar como hecha'"
                      (click)="toggleDone.emit({ item, done: !item.doneAt })"
                    >
                      <i class="pi pi-check" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn ghost sm icon"
                      aria-label="Editar tarjeta"
                      title="Editar (Espacio)"
                      (click)="open.emit(item)"
                    >
                      <i class="pi pi-pencil" aria-hidden="true"></i>
                    </button>
                    <button
                      type="button"
                      class="btn ghost sm icon danger"
                      aria-label="Borrar tarjeta"
                      title="Borrar (Supr)"
                      (click)="remove.emit(item)"
                    >
                      <i class="pi pi-trash" aria-hidden="true"></i>
                    </button>
                    @if (dragOff()) {
                      <p-select
                        class="move-to"
                        [options]="otherColumns(item)"
                        optionLabel="label"
                        optionValue="key"
                        [ngModel]="null"
                        (onChange)="moveTo(item, $event.value)"
                        placeholder="Mover a…"
                        ariaLabel="Mover la tarjeta a otra columna"
                        appendTo="body"
                      />
                    }
                  </div>
                }
              </li>
            }
          </ul>

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

      <div class="side">
        @if (addingColumn()) {
          <form class="add-form" (submit)="submitColumn($event)">
            <input
              #columnInput
              class="input"
              type="text"
              autocomplete="off"
              aria-label="Nombre de la nueva columna"
              placeholder="Nombre"
              [value]="newColumn()"
              (input)="newColumn.set(columnInput.value)"
              (keydown.escape)="addingColumn.set(false)"
              (blur)="blurColumn()"
            />
            <small>Intro para crear</small>
          </form>
        } @else {
          <button type="button" class="add-column" (click)="startColumn()">+ Columna</button>
        }
      </div>
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

  readonly move = output<BoardMove>();
  readonly add = output<{ column: string; title: string }>();
  readonly addColumn = output<string>();
  readonly open = output<Item>();
  readonly remove = output<Item>();
  readonly toggleDone = output<{ item: Item; done: boolean }>();

  protected readonly selectedId = signal<string | null>(null);
  protected readonly adding = signal<string | null>(null);
  protected readonly newTitle = signal('');
  protected readonly addingColumn = signal(false);
  protected readonly newColumn = signal('');
  /** Column the dragged card is over (for the ghost card text). */
  protected readonly hoverColumn = signal('');

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

  /** The first «select» field (e.g. priority) acts as the card's coloured identifier. */
  private badgeField(): FieldDef | undefined {
    return this.fieldDefs().find((def) => def.type === 'select');
  }

  /** Identifier next to the title: the select field value and, if none, the first label. */
  protected leadOf(item: Item): string | null {
    const field = this.badgeField();
    const value = field ? item.extra[field.key] : undefined;
    if (typeof value === 'string' && value !== '') return value;
    return item.tags[0] ?? null;
  }

  /** Labels left for the data row (the one already used as identifier is not repeated). */
  protected restTags(item: Item): string[] {
    const usedTag = this.leadOf(item) === item.tags[0] && item.tags[0] !== undefined;
    return item.tags.slice(usedTag ? 1 : 0, usedTag ? 3 : 2);
  }

  protected extrasOf(item: Item): string {
    const badge = this.badgeField();
    return extras(
      this.fieldDefs().filter((def) => def !== badge),
      item.extra,
    );
  }

  protected hue(label: string, index: number): string {
    return columnHue(label, index);
  }

  protected tagColor(tag: string): string {
    return tagHue(tag);
  }

  protected date(iso: string): string {
    return shortDate(iso);
  }

  protected overdue(item: Item): boolean {
    return isOverdue(item.dueDate, this.today);
  }

  protected drop(event: CdkDragDrop<string, string, Item>): void {
    this.hoverColumn.set('');
    const item = event.item.data;
    const column = event.container.data;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return;
    }
    this.selectedId.set(item.id);
    this.move.emit({
      id: item.id,
      request: dropRequest(this.items(), item.id, column, event.currentIndex),
    });
    this.focusCard(item.id);
  }

  protected otherColumns(item: Item): BoardColumn[] {
    return this.columns().filter((c) => c.key !== item.column);
  }

  /** «Mover a…» menu: the card goes to the end of the chosen column. */
  protected moveTo(item: Item, column: string | null): void {
    const request = column ? moveToRequest(this.items(), item.id, column) : null;
    if (!request) return;
    this.move.emit({ id: item.id, request });
    this.focusCard(item.id);
  }

  protected canShift(item: Item, direction: -1 | 1): boolean {
    return shiftRequest(this.items(), this.columns(), item.id, direction) !== null;
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

  protected startAdd(column: string): void {
    this.addingColumn.set(false);
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

  protected startColumn(): void {
    this.cancelAdd();
    this.newColumn.set('');
    this.addingColumn.set(true);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>('.side input')?.focus(),
      { injector: this.injector },
    );
  }

  protected submitColumn(event: Event): void {
    event.preventDefault();
    const label = this.newColumn().trim();
    if (!label) return;
    this.addColumn.emit(label);
    this.addingColumn.set(false);
  }

  protected blurColumn(): void {
    if (!this.newColumn().trim()) this.addingColumn.set(false);
  }
}
