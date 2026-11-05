import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDropList,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LIST_PRESETS, type List, type ListKind } from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { apiErrorMessage } from '../../core/api/errors';
import { AddButton } from '../../core/ui/add-button';
import { PageHeader } from '../../core/ui/page-header';
import { formatNoteDate } from '../notes/note-board.logic';
import { aliasError, cleanAlias, movedMessage, stepIndex } from './lists-logic';
import { ListsSkeleton } from './lists-skeleton';
import { ListsStore } from './lists.store';

const PRESET_KINDS = Object.keys(LIST_PRESETS) as ListKind[];
const KIND_LABELS: Record<ListKind, string> = {
  media: 'Colección',
  shopping: 'Compras',
  board: 'Tablero',
  free: 'Lista libre',
};

@Component({
  selector: 'app-lists-page',
  imports: [
    AddButton,
    PageHeader,
    RouterLink,
    ConfirmDialogModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDragPreview,
    ListsSkeleton,
  ],
  providers: [ConfirmationService],
  styleUrl: './lists-page.scss',
  template: `
    <div class="page">
      <app-page-header title="Listas" [eyebrow]="today">
        <app-add-button label="Nueva lista" [iconOnMobile]="true" (pressed)="openCreate()" />
      </app-page-header>

      @if (error(); as message) {
        <p class="alert create" role="alert">{{ message }}</p>
      }

      @if (creating()) {
        <section class="card create" aria-labelledby="new-list-title">
          <h2 id="new-list-title" class="sr-only">Nueva lista</h2>
          <form (submit)="create($event)">
            <div class="field">
              <span id="preset-label">Plantilla</span>
              <div class="segmented presets" role="group" aria-labelledby="preset-label">
                @for (kind of kinds; track kind) {
                  <button
                    type="button"
                    [attr.aria-pressed]="kind === selectedKind()"
                    (click)="pickKind(kind)"
                  >
                    {{ presets[kind].name }}
                  </button>
                }
              </div>
            </div>

            <label class="field">
              <span>Nombre</span>
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
                aria-describedby="alias-error"
                [attr.aria-invalid]="aliasProblem() ? 'true' : null"
                [value]="alias()"
                (input)="alias.set(aliasInput.value)"
              />
              <span id="alias-error" class="field-error" [hidden]="!aliasProblem()">
                {{ aliasProblem() }}
              </span>
            </label>

            <div class="actions">
              <button
                type="submit"
                class="btn primary"
                [disabled]="!name().trim() || !!aliasProblem()"
              >
                Crear lista
              </button>
              <button type="button" class="btn ghost" (click)="creating.set(false)">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      }

      @if (store.failed()) {
        <p class="alert" role="alert">
          No se pudieron cargar las listas.
          <button type="button" class="btn sm" (click)="store.load()">Reintentar</button>
        </p>
      } @else if (store.lists(); as lists) {
        @if (lists.length === 0) {
          <p class="empty">Todavía no hay listas. Crea la primera con «Nueva lista».</p>
        } @else {
          <ul
            class="grid"
            cdkDropList
            cdkDropListOrientation="mixed"
            aria-label="Listas"
            [cdkDropListDisabled]="dragOff()"
            (cdkDropListDropped)="drop($event)"
          >
            @for (
              list of lists;
              track list.id;
              let i = $index;
              let first = $first;
              let last = $last
            ) {
              <li class="card list-card" cdkDrag [cdkDragData]="list" [cdkDragDisabled]="dragOff()">
                <div *cdkDragPlaceholder class="slot" aria-hidden="true"></div>
                <div *cdkDragPreview matchSize class="preview">
                  <div class="preview-card">
                    {{ list.name }}
                    <small>{{ kindLabel(list) }}</small>
                  </div>
                </div>

                <h2>
                  <a [routerLink]="['/listas', list.slug]">{{ list.name }}</a>
                </h2>

                <div class="tools" role="group" [attr.aria-label]="'Orden de ' + list.name">
                  @if (!dragOff()) {
                    <button
                      type="button"
                      class="btn ghost sm icon tool handle"
                      cdkDragHandle
                      [attr.data-ctl]="list.id + ':handle'"
                      [attr.aria-label]="'Reordenar ' + list.name"
                      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End"
                      title="Arrastra, o usa las flechas con el asa enfocada"
                      (keydown)="handleKey($event, list)"
                    >
                      <i class="pi pi-bars" aria-hidden="true"></i>
                    </button>
                  }
                  <button
                    type="button"
                    class="btn ghost sm icon tool"
                    [attr.data-ctl]="list.id + ':before'"
                    [attr.aria-label]="'Mover ' + list.name + ' antes'"
                    [attr.aria-disabled]="first ? 'true' : null"
                    title="Mover antes"
                    (click)="moveBy(list, -1, 'before')"
                  >
                    <i class="pi pi-arrow-left ico-h" aria-hidden="true"></i>
                    <i class="pi pi-arrow-up ico-v" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    class="btn ghost sm icon tool"
                    [attr.data-ctl]="list.id + ':after'"
                    [attr.aria-label]="'Mover ' + list.name + ' después'"
                    [attr.aria-disabled]="last ? 'true' : null"
                    title="Mover después"
                    (click)="moveBy(list, 1, 'after')"
                  >
                    <i class="pi pi-arrow-right ico-h" aria-hidden="true"></i>
                    <i class="pi pi-arrow-down ico-v" aria-hidden="true"></i>
                  </button>
                </div>

                <div class="meta">
                  <span class="badge" [class.accent]="!!list.board">{{ kindLabel(list) }}</span>
                  @if (list.captureAlias) {
                    <span class="kbd">{{ list.captureAlias }}:</span>
                  }
                </div>
                <div class="foot">
                  <span>{{ countText(list) }}</span>
                  <button
                    type="button"
                    class="btn ghost sm archive"
                    [attr.aria-label]="'Archivar ' + list.name"
                    (click)="archive(list)"
                  >
                    Archivar
                  </button>
                </div>
              </li>
            }
          </ul>
          <p class="sr-only" role="status" aria-live="polite">{{ announcement() }}</p>
        }
      } @else {
        <app-lists-skeleton variant="grid" message="Cargando listas…" />
      }
    </div>

    <p-confirmdialog />
  `,
})
export class ListsPage {
  protected readonly store = inject(ListsStore);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly presets = LIST_PRESETS;
  protected readonly kinds = PRESET_KINDS;
  protected readonly today = formatNoteDate(new Date());
  protected readonly creating = signal(false);
  protected readonly selectedKind = signal<ListKind>('media');
  protected readonly name = signal(LIST_PRESETS.media.name);
  protected readonly alias = signal(LIST_PRESETS.media.captureAlias ?? '');
  protected readonly error = signal('');
  /** Screen-reader text after moving a list (`aria-live` region). */
  protected readonly announcement = signal('');
  /** On mobile and touch screens dragging is disabled (it competes with scrolling): buttons remain. */
  protected readonly dragOff = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  protected readonly aliasProblem = computed(() => aliasError(cleanAlias(this.alias())));

  constructor() {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(max-width: 767px), (pointer: coarse)');
      this.dragOff.set(query.matches);
      query.addEventListener('change', (event) => this.dragOff.set(event.matches));
    }

    // When the form opens, focus goes to the name (and the suggested one is selected so it can be overwritten).
    effect(() => {
      const input = this.nameInput();
      if (input) untracked(() => input.nativeElement.select());
    });

    // Item count of each card: recalculated when the lists change.
    effect(() => {
      this.store.lists();
      untracked(() => this.store.loadCounts());
    });
    // With no lists, the form is offered open.
    effect(() => {
      if (this.store.lists()?.length === 0) untracked(() => this.creating.set(true));
    });
  }

  /** Opens the creation form; if it is already open, puts the cursor back in the name. */
  protected openCreate(): void {
    if (this.creating()) this.nameInput()?.nativeElement.select();
    else this.creating.set(true);
  }

  protected kindLabel(list: List): string {
    if (list.board) return `Tablero · ${list.board.columns.length} columnas`;
    return KIND_LABELS[list.kind];
  }

  protected countText(list: List): string {
    const count = this.store.counts()[list.id];
    if (count === undefined) return '';
    return `${count} ${count === 1 ? 'elemento' : 'elementos'}`;
  }

  /** Drop after a mouse drag: `currentIndex` is already the final position. */
  protected drop(event: CdkDragDrop<List[], List[], List>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.moveTo(event.item.data, event.currentIndex);
  }

  /** «Mover antes/después» buttons: one place; at the end it does not move and a message is announced. */
  protected moveBy(list: List, step: -1 | 1, control: 'before' | 'after'): void {
    const target = stepIndex(this.store.lists() ?? [], list.id, step);
    if (target === null) {
      this.announcement.set(`${list.name} ya es la ${step === -1 ? 'primera' : 'última'} lista`);
      return;
    }
    this.moveTo(list, target, control);
  }

  /** Plain arrows with the handle focused (no Alt: Alt+arrows is navigation between sections). */
  protected handleKey(event: KeyboardEvent, list: List): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const lists = this.store.lists() ?? [];
    const last = lists.length - 1;
    const index = lists.findIndex((l) => l.id === list.id);
    const target = {
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (target < 0 || target > last || target === index) {
      this.announcement.set(`${list.name} ya es la ${index === 0 ? 'primera' : 'última'} lista`);
      return;
    }
    this.moveTo(list, target, 'handle');
  }

  /**
   * Moves the list to `to`. The order changes at once (optimistic); if the API fails, the store
   * puts it back and the error is shown here. Focus follows the card (the DOM is rearranged).
   */
  private moveTo(list: List, to: number, control?: 'handle' | 'before' | 'after'): void {
    this.error.set('');
    this.store.reorder(list.id, to).subscribe({
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.announcement.set(`No se pudo mover ${list.name}`);
      },
    });
    const lists = this.store.lists() ?? [];
    const at = lists.findIndex((l) => l.id === list.id);
    this.announcement.set(movedMessage(list.name, at, lists.length));
    if (control) this.focusControl(list.id, control);
  }

  private focusControl(id: string, control: string): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-ctl="${id}:${control}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected pickKind(kind: ListKind): void {
    this.selectedKind.set(kind);
    this.name.set(LIST_PRESETS[kind].name);
    this.alias.set(LIST_PRESETS[kind].captureAlias ?? '');
  }

  protected create(event: Event): void {
    event.preventDefault();
    const preset = LIST_PRESETS[this.selectedKind()];
    const alias = cleanAlias(this.alias());
    if (!this.name().trim() || aliasError(alias)) return;
    this.error.set('');
    this.store
      .create({
        name: this.name().trim(),
        kind: preset.kind,
        ...(preset.icon && { icon: preset.icon }),
        ...(alias && { captureAlias: alias }),
        fieldDefs: preset.fieldDefs,
        ...(preset.board && { board: preset.board }),
      })
      .subscribe({
        next: (list) => {
          this.creating.set(false);
          void this.router.navigate(['/listas', list.slug]);
        },
        error: (error: unknown) => this.error.set(apiErrorMessage(error)),
      });
  }

  /** Archiving removes the list from the screen (and its alias from quick capture): confirmation is asked. */
  protected archive(list: List): void {
    this.confirmation.confirm({
      header: 'Archivar lista',
      message: `¿Archivar «${list.name}»? Dejará de aparecer en las listas.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () =>
        this.store.archive(list).subscribe({
          error: (error: unknown) => this.error.set(apiErrorMessage(error)),
        }),
    });
  }
}
