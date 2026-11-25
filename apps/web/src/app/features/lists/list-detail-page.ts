import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Item, List } from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SelectModule } from 'primeng/select';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { AddButton } from '../../core/ui/add-button';
import { Icon } from '../../core/ui/icon';
import { applyMove, makeMatcher, moveToRequest, summaryText } from './board-logic';
import { ItemDialog } from './item-dialog';
import { ItemSidebar } from './item-sidebar';
import { ListBoard, type BoardMove } from './list-board';
import { ListSettings } from './list-settings';
import { ListTable } from './list-table';
import { ListsSkeleton } from './lists-skeleton';
import { ListsStore } from './lists.store';
import { isConfigurable } from './settings-logic';

@Component({
  selector: 'app-list-detail-page',
  imports: [
    RouterLink,
    FormsModule,
    SelectModule,
    ConfirmDialogModule,
    AddButton,
    Icon,
    ItemDialog,
    ItemSidebar,
    ListBoard,
    ListSettings,
    ListTable,
    ListsSkeleton,
  ],
  providers: [ConfirmationService],
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-5);
      min-height: var(--control-height);
      margin-bottom: var(--space-5);
    }

    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) 10px;
      min-width: 0;
    }

    .crumb {
      color: var(--muted);
      font-size: var(--text-base);
    }

    .crumb a {
      color: var(--muted);
    }

    /* The same size as the title of every other screen (see PageHeader). */
    h1 {
      overflow-wrap: anywhere;
      font-size: var(--text-xl);
    }

    .head-tools {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .summary {
      margin-left: var(--space-2);
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .search {
      flex: 1 1 200px;
      max-width: 320px;
    }

    .tag {
      flex: 0 1 190px;
    }

    .quick {
      display: flex;
      flex: 1 1 280px;
      gap: var(--space-2);
      max-width: 460px;
      margin-left: auto;
    }

    .count {
      margin-bottom: var(--space-3);
    }

    /* Ghost title while the list is still unknown: takes the space of the real header. */
    .skeleton.head-skeleton {
      width: 240px;
      max-width: 100%;
      height: var(--control-height);
      margin-bottom: var(--space-5);
      /* Appears with a delay, like the rest of the skeleton: a fast load never shows it. */
      opacity: 0;
      animation:
        skeleton-shimmer 1.4s ease-in-out infinite,
        skeleton-in 0.2s ease-out 0.15s forwards;
    }

    @keyframes skeleton-in {
      to {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton.head-skeleton {
        animation: skeleton-in 0.01s ease-out 0.15s forwards;
      }
    }

    @media (width <= 767px) {
      h1 {
        font-size: 22px;
        letter-spacing: -0.02em;
      }

      .search,
      .tag,
      .quick {
        flex: 1 1 100%;
        max-width: none;
        margin-left: 0;
      }

      .head-tools .btn,
      .toolbar .input,
      .toolbar .select,
      .toolbar .btn,
      .segmented > button {
        min-height: var(--touch-target);
      }

      .toolbar ::ng-deep .p-select {
        min-height: var(--touch-target);
      }

      .toolbar .input {
        font-size: max(16px, var(--text-base));
      }
    }
  `,
  template: `
    <div class="page">
      @if (list(); as list) {
        <header class="head">
          <div class="title">
            <span class="crumb"><a routerLink="/listas">Listas</a> /</span>
            <h1>{{ list.name }}</h1>
            @if (visible()) {
              <span class="summary">{{ summary() }}</span>
            }
          </div>

          <div class="head-tools">
            @if (configurable()) {
              <button
                type="button"
                class="btn"
                aria-label="Configurar la lista"
                (click)="settingsOpen.set(true)"
              >
                <app-icon name="settings" />
                <span class="cfg-text">Configurar</span>
              </button>
            }
            <app-add-button
              label="Nuevo elemento"
              [iconOnMobile]="true"
              (pressed)="creating.set(true)"
            />
          </div>
        </header>

        <div class="toolbar" role="search">
          <input
            #qInput
            class="input search"
            type="search"
            autocomplete="off"
            aria-label="Buscar en la lista"
            placeholder="Buscar…"
            [value]="q()"
            (input)="q.set(qInput.value)"
          />
          <p-select
            class="tag"
            [options]="knownTags()"
            [ngModel]="tag() || null"
            (onChange)="tag.set($event.value ?? '')"
            [showClear]="true"
            placeholder="Todas las etiquetas"
            ariaLabel="Filtrar por etiqueta"
            appendTo="body"
          >
            <ng-template #selectedItem let-label>
              <span class="tag-chip">{{ label }}</span>
            </ng-template>
            <ng-template #item let-label>
              <span class="tag-chip">{{ label }}</span>
            </ng-template>
          </p-select>

          @if (!showBoard()) {
            <form class="quick" (submit)="add($event)">
              <input
                #titleInput
                class="input"
                type="text"
                autocomplete="off"
                aria-label="Nuevo elemento"
                placeholder="Nuevo elemento y Intro"
                [value]="newTitle()"
                (input)="newTitle.set(titleInput.value)"
              />
            </form>
          }
        </div>

        @if (error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }

        @if (visible(); as items) {
          @if (showBoard() && list.board) {
            <app-list-board
              [columns]="list.board.columns"
              [items]="items"
              [openId]="sidebarId()"
              [fieldDefs]="list.fieldDefs"
              (move)="move($event)"
              (add)="addInColumn($event.column, $event.title)"
              (open)="sidebarId.set($event.id)"
              (remove)="askRemove($event)"
            />
          } @else if (items.length === 0 && !filtering()) {
            <p class="empty">Esta lista está vacía. Escribe un título arriba y pulsa Intro.</p>
          } @else {
            <app-list-table
              [list]="list"
              [items]="items"
              (edit)="editing.set($event)"
              (remove)="askRemove($event)"
              (toggle)="toggleDone($event.item, $event.done)"
            />
          }
        } @else if (!error()) {
          <app-lists-skeleton
            [variant]="showBoard() ? 'board' : 'table'"
            message="Cargando elementos…"
          />
        }

        @if (sidebarItem(); as card) {
          @if (list.board; as board) {
            <app-item-sidebar
              [item]="card"
              [columns]="board.columns"
              (moveTo)="moveCard(card, $event)"
              (remove)="askRemove(card)"
              (closed)="sidebarId.set(null)"
            />
          }
        }

        <app-list-settings
          [list]="list"
          [items]="items()"
          [open]="settingsOpen()"
          (closed)="settingsOpen.set(false)"
          (saved)="settingsOpen.set(false)"
        />

        <app-item-dialog
          [item]="editing()"
          [creating]="creating()"
          [list]="list"
          (saved)="saved()"
          (closed)="closeDialog()"
          (removed)="askRemove($event)"
        />
      } @else if (store.lists()) {
        <p class="empty">
          No existe ninguna lista «{{ slug() }}». <a routerLink="/listas">Volver a las listas</a>
        </p>
      } @else if (store.failed()) {
        <p class="alert" role="alert">No se pudieron cargar las listas.</p>
      } @else {
        <span class="skeleton title head-skeleton" aria-hidden="true"></span>
        <app-lists-skeleton variant="table" message="Cargando lista…" />
      }
    </div>

    <p-confirmdialog />
  `,
})
export class ListDetailPage {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  private readonly confirmation = inject(ConfirmationService);
  protected readonly store = inject(ListsStore);

  /** `:slug` route parameter (arrives via `withComponentInputBinding`). */
  readonly slug = input.required<string>();
  protected readonly list = computed(() => this.store.lists()?.find((l) => l.slug === this.slug()));

  protected readonly items = signal<Item[] | null>(null);
  protected readonly error = signal('');
  protected readonly newTitle = signal('');
  protected readonly q = signal('');
  protected readonly tag = signal('');
  protected readonly editing = signal<Item | null>(null);
  /** The dialog is open to create an element (Alt N). */
  protected readonly creating = signal(false);
  protected readonly settingsOpen = signal(false);
  /** Boards and tables (also the old media and shopping presets) have settings; simple lists do not. */
  protected readonly configurable = computed(() => {
    const list = this.list();
    return !!list && isConfigurable(list);
  });
  /** The card open in the side panel of a board. */
  protected readonly sidebarId = signal<string | null>(null);
  protected readonly sidebarItem = computed(
    () => this.items()?.find((item) => item.id === this.sidebarId()) ?? null,
  );
  /** The labels in the list: the options of the filter. */
  protected readonly knownTags = computed(() =>
    [...new Set((this.items() ?? []).flatMap((item) => item.tags))].sort(),
  );
  /** What the search box and the label filter leave. */
  protected readonly visible = computed(() => {
    const items = this.items();
    if (!items || !this.filtering()) return items;
    return items.filter(makeMatcher(this.q(), this.tag()));
  });

  protected readonly filtering = computed(() => !!this.q().trim() || !!this.tag());
  protected readonly showBoard = computed(() => !!this.list()?.board);
  protected readonly summary = computed(() =>
    summaryText(this.visible() ?? [], this.showBoard() ? 'card' : 'item'),
  );

  private readonly board = viewChild(ListBoard);
  private currentListId: string | null = null;
  private pendingMoves = 0;

  constructor() {
    // A label that no card has any more cannot stay as the filter.
    effect(() => {
      const tag = this.tag();
      if (tag && this.items() && !this.knownTags().includes(tag)) untracked(() => this.tag.set(''));
    });
    // Reload when the list changes or another screen reports changes. The search and the label
    // filter are applied here, on the loaded items.
    effect(() => {
      const list = this.list();
      this.bus.version();
      if (list) untracked(() => this.load(list));
    });
  }

  private load(list: List): void {
    if (list.id !== this.currentListId) {
      // Another list: start from scratch (filters, view).
      this.currentListId = list.id;
      this.items.set(null);
      this.error.set('');
      this.q.set('');
      this.tag.set('');
      this.editing.set(null);
      this.creating.set(false);
      this.settingsOpen.set(false);
      this.sidebarId.set(null);
    }
    this.api.items(list.id).subscribe({
      next: (items) => this.items.set(items),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  private reload(): void {
    this.bus.changed();
  }

  private fail = (error: unknown) => {
    this.error.set(apiErrorMessage(error));
    this.reload();
  };

  protected add(event: Event): void {
    event.preventDefault();
    const title = this.newTitle().trim();
    if (!title) return;
    this.addInColumn(undefined, title, () => this.newTitle.set(''));
  }

  protected addInColumn(column: string | undefined, title: string, done?: () => void): void {
    const list = this.list();
    if (!list) return;
    this.error.set('');
    this.api
      .createItem({
        listId: list.id,
        title,
        tags: [],
        extra: {},
        source: 'manual',
        ...(column && { column }),
      })
      .subscribe({
        next: () => {
          done?.();
          this.reload();
        },
        error: this.fail,
      });
  }

  protected toggleDone(item: Item, done: boolean): void {
    this.api
      .updateItem(item.id, { done })
      .subscribe({ next: () => this.reload(), error: this.fail });
  }

  /** Moves a card: reflected at once and saved; if it fails, the real state is reloaded. */
  protected move({ id, request }: BoardMove): void {
    const column = request.column;
    if (column) {
      this.items.update((items) => (items ? applyMove(items, id, column, request.afterId) : items));
    }
    this.error.set('');
    this.pendingMoves++;
    this.api.moveItem(id, request).subscribe({
      next: () => {
        // With several moves in a row, reload only after the last one.
        if (--this.pendingMoves === 0) this.reload();
      },
      error: (error: unknown) => {
        this.pendingMoves--;
        this.fail(error);
      },
    });
  }

  /** Moves a card to the end of another column, from the side panel. */
  protected moveCard(card: Item, column: string): void {
    const request = moveToRequest(this.items() ?? [], card.id, column);
    if (request) this.move({ id: card.id, request });
  }

  protected saved(): void {
    this.editing.set(null);
    this.creating.set(false);
    this.reload();
    this.refocusBoard();
  }

  protected closeDialog(): void {
    this.editing.set(null);
    this.creating.set(false);
    this.refocusBoard();
  }

  /** The dialog releases focus when its close animation ends: focus goes back to the card afterwards. */
  private refocusBoard(): void {
    setTimeout(() => this.board()?.focusCard(), 250);
  }

  protected askRemove(item: Item): void {
    this.confirmation.confirm({
      header: 'Borrar elemento',
      message: `¿Borrar «${item.title}»? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Borrar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.remove(item),
    });
  }

  private remove(item: Item): void {
    this.api.deleteItem(item.id).subscribe({
      next: () => {
        if (this.editing()?.id === item.id) this.editing.set(null);
        if (this.sidebarId() === item.id) this.sidebarId.set(null);
        this.reload();
      },
      error: this.fail,
    });
  }
}
