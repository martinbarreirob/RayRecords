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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  DEFAULT_LIST_ALIASES,
  parseQuickCapture,
  type CaptureResponse,
  type List,
  type NoteCard,
} from '@rayrecords/shared';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  forkJoin,
  map,
  of,
  switchMap,
  type Observable,
} from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { AuthStore } from '../../core/auth/auth.store';
import {
  PALETTE_FILTERS,
  captureResult,
  cycleFilter,
  expenseResults,
  flattenGroups,
  groupResults,
  highlightSegments,
  itemResults,
  moveSelection,
  searchCommands,
  searchLists,
  searchNotes,
  type HighlightSegment,
  type PaletteFilter,
  type PaletteResult,
  type PaletteRow,
} from '../../core/palette/palette-logic';
import { GO_TARGETS, shortcutLabel } from '../../core/palette/go-shortcuts';
import { PaletteService } from '../../core/palette/palette.service';
import { RefreshBus } from '../../core/refresh';
import { ThemeService } from '../../core/theme/theme.service';
import {
  completion,
  prefixOptions,
  suggestPrefixes,
  type PrefixOption,
} from '../capture/capture-prefix';
import { describeCapture, previewCapture } from '../capture/capture-preview';
import { ListsStore } from '../lists/lists.store';
import { PaletteCapture, type CaptureFeedback } from './palette-capture';
import {
  EMPTY_REMOTE,
  MIN_REMOTE_CHARS,
  SEARCH_DEBOUNCE_MS,
  searchRemote,
  type RemoteState,
} from './palette-search';

interface PaletteData {
  lists: List[];
  cards: NoteCard[];
}

/** "Buscar y ejecutar" (Ctrl+K) or "escribir una nota o tarea" (with "/"). */
type PaletteMode = 'search' | 'capture';

/** Footer help with the section shortcuts: "⇧N · ⇧L · ⇧C · ⇧G · ⇧U". */
const GO_HINT = (Object.keys(GO_TARGETS) as (keyof typeof GO_TARGETS)[])
  .map(shortcutLabel)
  .join(' · ');

/**
 * Body of the command palette (Ctrl+K): search lists, cards, notes and expenses, run commands and,
 * with "/" first, write a note or task with a preview of where it will go (the former quick capture
 * bar). Downloaded the first time the palette opens (see `CommandPalette`). It uses its own CSS and
 * not `p-dialog`, to match the design (A5).
 */
@Component({
  selector: 'app-palette-dialog',
  imports: [PaletteCapture],
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
  styleUrl: './palette-dialog.scss',
  templateUrl: './palette-dialog.html',
})
export class PaletteDialog {
  protected readonly palette = inject(PaletteService);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthStore);
  private readonly bus = inject(RefreshBus);
  private readonly listsStore = inject(ListsStore);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly listEl = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly filters = PALETTE_FILTERS;
  protected readonly query = signal('');
  protected readonly filter = signal<PaletteFilter>('all');
  private readonly selected = signal(0);
  private readonly data = signal<PaletteData | null>(null);
  private readonly remote = signal<RemoteState>(EMPTY_REMOTE);
  protected readonly mode = signal<PaletteMode>('search');
  /** Saving what was typed in capture mode (the field is read-only until the API answers). */
  protected readonly saving = signal(false);
  /** What was just saved, with its link and its "Deshacer". */
  protected readonly feedback = signal<CaptureFeedback | null>(null);
  /** How to undo the last save (deletes the item or the card). */
  private undoLast: Observable<unknown> | null = null;
  /** Error of an action (create note, save...); shown in the results footer or above the preview. */
  protected readonly statusError = signal('');
  protected readonly goHint = GO_HINT;

  /** What is typed to search. In capture mode it is what will be saved, not a search: it stays empty. */
  protected readonly trimmedQuery = computed(() =>
    this.mode() === 'search' ? this.query().trim() : '',
  );

  /** Really visible area (without the on-screen keyboard): on mobile the layer fits it. `null` = no data. */
  private readonly visual = signal<{ height: number; top: number } | null>(null);
  protected readonly viewport = computed(() => ({
    height: this.visual() ? `${this.visual()!.height}px` : null,
    top: this.visual() ? `${this.visual()!.top}px` : null,
  }));

  /** Waiting for the lists or the server response for the current query. */
  private readonly searching = computed(
    () =>
      this.trimmedQuery().length >= MIN_REMOTE_CHARS &&
      (this.data() === null || this.remote().query !== this.trimmedQuery()),
  );

  /** Lists used to parse the input: the palette's, or the store's until they load. */
  private readonly captureLists = computed(
    () => this.data()?.lists ?? this.listsStore.lists() ?? null,
  );
  private readonly aliases = computed(
    () =>
      this.captureLists()?.flatMap((list) => (list.captureAlias ? [list.captureAlias] : [])) ??
      DEFAULT_LIST_ALIASES,
  );
  protected readonly prefixes = computed(() => prefixOptions(this.captureLists()));

  /** How what is typed in capture mode is interpreted, with warnings and where it will go. */
  protected readonly preview = computed(() => {
    if (this.mode() !== 'capture') return null;
    const text = this.query();
    const result = parseQuickCapture(text, { aliases: this.aliases() });
    return previewCapture(result, this.captureLists(), { text, prefixes: this.prefixes() });
  });
  protected readonly suggestions = computed(() =>
    this.mode() === 'capture' ? suggestPrefixes(this.query(), this.prefixes()) : [],
  );
  /** What Esc does right now in capture mode, for the footer. */
  protected readonly escHint = computed(() => {
    if (this.query()) return 'Esc vaciar';
    return this.feedback() ? 'Esc cerrar' : 'Esc volver a buscar';
  });

  protected readonly groups = computed(() => {
    const query = this.trimmedQuery();
    const data = this.data();
    const remote = this.remote();
    const lists = data?.lists ?? [];
    const results: PaletteResult[] = [];

    if (query) {
      const trusted = remote.query === query;
      results.push(
        ...searchLists(query, lists),
        ...itemResults(query, remote.items, lists, trusted),
        ...searchNotes(query, data?.cards ?? []),
        ...expenseResults(query, remote.transactions, trusted),
      );
    }
    results.push(
      ...searchCommands(query, {
        themeLabel: this.theme.label(),
        username: this.auth.user()?.username ?? '',
      }),
    );
    // What was typed matches nothing: offer to save it as a capture.
    if (query && results.length === 0 && !this.searching()) {
      const parsed = parseQuickCapture(query, { aliases: this.aliases() });
      results.push(captureResult(query, describeCapture(parsed, this.captureLists() ?? lists)));
    }
    return groupResults(results, this.filter());
  });

  private readonly rows = computed(() => flattenGroups(this.groups()));

  protected readonly activeIndex = computed(() =>
    Math.min(this.selected(), Math.max(0, this.rows().length - 1)),
  );

  protected readonly activeId = computed(() => {
    const row = this.rows()[this.activeIndex()];
    return row ? this.optionId(row) : null;
  });

  protected readonly statusMessage = computed(() => {
    const error = this.statusError();
    if (error) return error;
    const query = this.trimmedQuery();
    if (this.searching()) return 'Buscando…';
    if (this.rows().length > 0) {
      return this.remote().failed && query ? 'Algunos resultados no se pudieron cargar' : '';
    }
    if (!query) {
      const label = PALETTE_FILTERS.find((option) => option.id === this.filter())?.label;
      return `Escribe para buscar en ${label?.toLowerCase()}`;
    }
    return `Sin resultados para «${query}». Ctrl Enter lo guarda como nota o tarea.`;
  });

  constructor() {
    // Each opening starts from scratch and loads what is searched locally (lists and notes).
    effect(() => {
      if (this.palette.isOpen()) untracked(() => this.reset());
    });

    // With the on-screen keyboard the usable height is less than the window: follow the visualViewport.
    effect((onCleanup) => {
      const viewport = typeof window === 'undefined' ? null : window.visualViewport;
      if (!this.palette.isOpen() || !viewport) return;
      const update = () =>
        this.visual.set({
          height: Math.round(viewport.height),
          top: Math.round(viewport.offsetTop),
        });
      update();
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      onCleanup(() => {
        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
      });
    });

    // Focus goes to the field on open.
    effect(() => this.field()?.nativeElement.focus());

    // The active row is always in view, also when the list changes.
    effect(() => {
      const index = this.activeIndex();
      this.groups();
      afterNextRender(() => this.scrollToActive(index), { injector: this.injector });
    });

    // Server search: debounced and cancelling the previous request when typing more.
    toObservable(
      computed(() => ({ query: this.trimmedQuery(), lists: this.data()?.lists ?? null })),
    )
      .pipe(
        filter((input) => input.lists !== null),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged((a, b) => a.query === b.query && a.lists === b.lists),
        switchMap(({ query, lists }) => searchRemote(this.api, query, lists!)),
        takeUntilDestroyed(),
      )
      .subscribe((remote) => this.remote.set(remote));
  }

  /** Row text with what matches the typed text marked. "Capturar" is not marked: it is the whole typed text. */
  protected highlight(row: PaletteRow): HighlightSegment[] {
    return highlightSegments(row.label, row.kind === 'capture' ? '' : this.trimmedQuery());
  }

  protected optionId(row: PaletteRow): string {
    return `palette-option-${row.index}`;
  }

  private reset(): void {
    this.query.set('');
    this.filter.set('all');
    this.selected.set(0);
    this.remote.set(EMPTY_REMOTE);
    this.statusError.set('');
    this.feedback.set(null);
    this.saving.set(false);
    this.undoLast = null;
    // Opened with "/" it enters write-a-note-or-task mode directly.
    this.mode.set(this.palette.takeCaptureRequest() ? 'capture' : 'search');
    this.data.set(null);

    forkJoin({
      lists: this.api.lists().pipe(catchError(() => of([] as List[]))),
      cards: this.api.noteBoard().pipe(
        map((board) => board.cards),
        catchError(() => of([] as NoteCard[])),
      ),
    }).subscribe((data) => {
      if (this.palette.isOpen()) this.data.set(data);
    });
  }

  // --- Interaction ---------------------------------------------------------------------------

  protected onInput(value: string): void {
    // "/" as the first character triggers capture mode: it is consumed and is not part of the text.
    if (this.mode() === 'search' && this.query() === '' && value.startsWith('/')) {
      this.enterCapture(value.slice(1));
      return;
    }
    this.query.set(value);
    this.selected.set(0);
    this.statusError.set('');
    // Typing again discards the confirmation of the previous one (including its "Deshacer").
    if (this.mode() === 'capture' && !this.saving()) this.feedback.set(null);
  }

  /** Sets the field text and syncs the DOM even if the value is unchanged. */
  private setField(value: string): void {
    this.query.set(value);
    const element = this.field()?.nativeElement;
    if (element) element.value = value;
  }

  private focusField(): void {
    queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  /** Enters "write a note or task", with `text` already typed (empty when coming from "/"). */
  protected enterCapture(text = ''): void {
    this.mode.set('capture');
    this.filter.set('all');
    this.selected.set(0);
    this.statusError.set('');
    this.feedback.set(null);
    this.setField(text);
    this.focusField();
  }

  /** Goes back to search and run, with the field empty. */
  protected exitCapture(): void {
    if (this.saving()) return;
    this.mode.set('search');
    this.statusError.set('');
    this.feedback.set(null);
    this.setField('');
    this.focusField();
  }

  /** Accepts a prefix suggestion ("com" becomes "compra: ") and leaves the cursor at the end of the field. */
  protected pickPrefix(option: PrefixOption): void {
    if (this.saving()) return;
    this.statusError.set('');
    this.feedback.set(null);
    this.setField(completion(option));
    this.focusField();
  }

  protected setFilter(next: PaletteFilter): void {
    this.filter.set(next);
    this.selected.set(0);
    this.field()?.nativeElement.focus();
  }

  protected onRowHover(event: MouseEvent, row: PaletteRow): void {
    // Synthetic `mousemove` events after a scroll carry no movement: they must not steal the selection.
    if ((event.movementX || event.movementY) && row.index !== this.selected()) {
      this.selected.set(row.index);
    }
  }

  protected onBackdropMousedown(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.palette.hide();
  }

  /** Click on the layer without touching the field: focus is not lost. */
  protected keepInputFocus(event: MouseEvent): void {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.palette.isOpen()) this.onPaletteKey(event);
  }

  private onPaletteKey(event: KeyboardEvent): void {
    if (event.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.onEscape();
      return;
    }

    if (this.mode() === 'capture') {
      this.onCaptureKey(event);
      return;
    }

    const count = this.rows().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.selected.set(
          moveSelection(this.activeIndex(), event.key === 'ArrowDown' ? 1 : -1, count),
        );
        break;
      case 'Tab':
        event.preventDefault();
        this.filter.set(cycleFilter(this.filter(), event.shiftKey ? -1 : 1));
        this.selected.set(0);
        break;
      case 'Enter': {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const query = this.trimmedQuery();
          if (query) this.save(query);
          return;
        }
        const row = this.rows()[this.activeIndex()];
        if (row) this.run(row);
        break;
      }
    }
  }

  /**
   * Esc: while searching, closes. While writing a note or task, first clears the text, then (with no
   * text) goes back to search; if something was just saved, closes completely.
   */
  private onEscape(): void {
    if (this.mode() === 'search') {
      this.palette.hide();
    } else if (this.query()) {
      this.statusError.set('');
      this.setField('');
    } else if (this.feedback()) {
      this.palette.hide();
    } else {
      this.exitCapture();
    }
  }

  private onCaptureKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.save(this.query());
        break;
      case 'Tab': {
        // Tab completes the suggested prefix; if there is none, focus stays in the field.
        event.preventDefault();
        const first = this.suggestions()[0];
        if (first && !event.shiftKey) this.pickPrefix(first);
        break;
      }
      case 'Backspace':
        // With an empty field, backspace leaves the mode (a single press, not the repeat from holding it).
        if (!event.repeat && this.query() === '' && !this.saving()) {
          event.preventDefault();
          this.exitCapture();
        }
        break;
    }
  }

  private scrollToActive(index: number): void {
    const list = this.listEl()?.nativeElement;
    if (!list) return;
    if (index === 0) {
      list.scrollTop = 0;
      return;
    }
    list.querySelector(`#palette-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }

  // --- Actions ------------------------------------------------------------------------------

  protected run(row: PaletteResult): void {
    this.statusError.set('');
    const action = row.action;
    switch (action.type) {
      case 'go':
        this.palette.hide(false);
        void this.router.navigateByUrl(action.url);
        break;
      case 'start-capture':
        this.enterCapture();
        break;
      case 'new-note':
        this.newNote();
        break;
      case 'toggle-theme':
        this.theme.cycle();
        this.palette.hide();
        break;
      case 'logout':
        this.palette.hide(false);
        // On a network error the UI is left too, like the shell's "Salir" button.
        this.auth.logout().subscribe({
          complete: () => void this.router.navigate(['/login']),
          error: () => void this.router.navigate(['/login']),
        });
        break;
      case 'capture':
        this.save(action.text);
        break;
    }
  }

  /** "Nueva tarjeta vacía": creates a blank card on the canvas and goes to Notas to edit it. */
  private newNote(): void {
    this.api.createNoteCard({ text: '' }).subscribe({
      next: (card) => {
        this.bus.changed();
        this.palette.hide(false);
        this.palette.newNoteId.set(card.id);
        void this.router.navigateByUrl('/notas');
      },
      error: (error: unknown) =>
        this.statusError.set(apiErrorMessage(error, 'No se pudo crear la nota')),
    });
  }

  /** Enter or "Añadir" in capture mode. */
  protected submit(): void {
    this.save(this.query());
  }

  /**
   * Saves `text` (the server interprets it with the real aliases). From search (Ctrl+Enter or the
   * "Capturar" row) it first switches to capture mode, so the result, the error and the empty field for
   * the next one are the same. On error the text is kept to retry.
   */
  private save(text: string): void {
    if (this.saving()) return;
    const typed = text.trim();
    const parsed = parseQuickCapture(typed, { aliases: this.aliases() });
    if (this.mode() !== 'capture') this.enterCapture(typed);

    if (parsed.kind === 'empty') {
      this.statusError.set(
        parsed.reason === 'no_title'
          ? 'Falta el título: escribe algo después del prefijo.'
          : 'Escribe una nota o una tarea.',
      );
      return;
    }

    this.statusError.set('');
    this.feedback.set(null);
    this.saving.set(true);
    this.api.capture(typed).subscribe({
      next: (response) => {
        this.saving.set(false);
        if (response.kind === 'empty') {
          this.statusError.set('Nada que guardar: escribe una nota o una tarea.');
          return;
        }
        this.bus.changed();
        this.showSaved(response);
        this.setField('');
        this.focusField();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.statusError.set(
          `${apiErrorMessage(error, 'No se pudo guardar')}. Tu texto sigue aquí: pulsa Enter para reintentar.`,
        );
        this.focusField();
      },
    });
  }

  /** Brief confirmation: "Añadido a Compras · Ver · Deshacer". */
  private showSaved(response: Exclude<CaptureResponse, { kind: 'empty' }>): void {
    const warning = response.warning ? ` · ${response.warning}` : '';
    if (response.kind === 'item') {
      const slug = this.captureLists()?.find((list) => list.id === response.item.listId)?.slug;
      this.undoLast = this.api.deleteItem(response.item.id);
      this.feedback.set({
        message: `Añadido a ${response.listName}${warning}`,
        link: slug ? `/listas/${slug}` : null,
        canUndo: true,
      });
    } else {
      this.undoLast = this.api.deleteNoteCard(response.card.id);
      this.feedback.set({
        message: `Añadida como nota suelta al lienzo${warning}`,
        link: '/notas',
        canUndo: true,
      });
    }
  }

  protected undo(): void {
    const request = this.undoLast;
    if (!request) return;
    this.undoLast = null;
    request.subscribe({
      next: () => {
        this.bus.changed();
        this.feedback.set({ message: 'Captura deshecha', link: null, canUndo: false });
      },
      error: (error: unknown) =>
        this.feedback.set({
          message: apiErrorMessage(error, 'No se pudo deshacer'),
          link: null,
          canUndo: false,
        }),
    });
  }

  /** "Ver": closes the palette and goes to where the saved item is. */
  protected open(url: string): void {
    this.palette.hide(false);
    void this.router.navigateByUrl(url);
  }
}
