import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  CARD_ESTIMATED_HEIGHT,
  arrangeInGrid,
  clampCoord,
  formatDuration,
  remainingMs,
  stackEndY,
  toAbsolute,
  toRelative,
  type NoteCard,
  type NoteGroup,
  type Point,
  type Rect,
} from '@rayrecords/shared';
import { PaletteService } from '../../core/palette/palette.service';
import { RefreshBus } from '../../core/refresh';
import {
  arrangeItems,
  arrowMove,
  formatNoteDate,
  freeSlot,
  idsTouchedBy,
  rectBetween,
  rightEdge,
} from './note-board.logic';
import { NoteBoardStore } from './note-board.store';
import {
  DRAG_THRESHOLD,
  advanceDrag,
  dragPreview,
  dropMoves,
  groupAround,
  startDrag,
  type Drag,
} from './note-drag';
import { NoteCardComponent } from './note-card';
import { NoteGroupComponent } from './note-group';
import { NotesFinished } from './notes-finished';
import { NotesHints } from './notes-hints';
import { NotesMobileList } from './notes-mobile-list';
import { NotesSkeleton } from './notes-skeleton';
import { readLayoutLocked, writeLayoutLocked } from './notes-prefs';

const MOBILE_QUERY = '(max-width: 767px)';
const MARQUEE_THRESHOLD = 4;
/** Lienzo que se deja más allá de lo más lejano, para poder seguir colocando hacia la derecha. */
const RIGHT_SPARE = 24;
/** Lo que tarda la tarjeta soltada en asentarse (debe coincidir con la transición de note-card). */
const LAND_MS = 180;
/** Cuánto se queda el aviso «Disposición bloqueada» si no se cierra. */
const LOCK_NOTICE_MS = 4_000;

interface Ghost {
  card: NoteCard;
  landing: boolean;
}

/** El evento nace en el hueco del grupo (él mismo o el contenedor de su pila), no en una nota ni en la cabecera. */
function isGroupBackground(event: Event): boolean {
  const { target, currentTarget } = event;
  return (
    target === currentTarget ||
    (target instanceof HTMLElement && target.classList.contains('stack'))
  );
}

function sameNumbers(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

function sameRects(a: ReadonlyMap<string, Rect>, b: ReadonlyMap<string, Rect>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, r] of a) {
    const o = b.get(key);
    if (!o || o.x !== r.x || o.y !== r.y || o.w !== r.w || o.h !== r.h) return false;
  }
  return true;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

/** Controles con su propio Enter (botones, enlaces, resúmenes, casillas): el atajo de editar no debe robárselo. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button, a, summary, [role="checkbox"], [role="button"]') !== null
  );
}

/**
 * Notas como tarjetas en un lienzo: se crean con doble clic o N, se mueven libremente (la posición se
 * guarda), se agrupan y se marcan como hechas (desaparecen 24 h después). En pantallas estrechas el
 * lienzo se muestra como una lista ordenada por posición.
 */
@Component({
  selector: 'app-notes-page',
  imports: [
    NgTemplateOutlet,
    NoteCardComponent,
    NoteGroupComponent,
    NotesFinished,
    NotesHints,
    NotesMobileList,
    NotesSkeleton,
  ],
  providers: [NoteBoardStore],
  host: {
    class: 'page',
    '[style.--notes-top]': 'top() + "px"',
    '(document:keydown)': 'onKeydown($event)',
  },
  styleUrl: './notes-page.scss',
  template: `
    <header class="page-header">
      <div class="title-block">
        <h1>Notas</h1>
        <span class="page-eyebrow">{{ today }}</span>
      </div>
      <div class="actions">
        @if (!compact()) {
          <button type="button" class="btn primary sm" (click)="newCard()">
            Nueva nota <span class="kbd">N</span>
          </button>
          <button
            type="button"
            class="btn sm"
            aria-label="Ordenar notas"
            title="Ordenar: coloca las notas en una rejilla limpia (se puede deshacer)"
            (click)="arrange()"
          >
            <i class="pi pi-th-large" aria-hidden="true"></i>
            Ordenar
          </button>
        }
        <button
          type="button"
          class="btn sm"
          aria-controls="notes-finished"
          aria-describedby="notes-finished-help"
          title="Las notas hechas se ocultan del lienzo a las 24 h; aquí puedes recuperarlas."
          [attr.aria-expanded]="showDone()"
          (click)="toggleDonePanel()"
        >
          Terminadas ({{ store.finished().length }})
        </button>
        <span id="notes-finished-help" class="sr-only">
          Las notas hechas se ocultan del lienzo a las 24 horas; en este panel se recuperan.
        </span>
        @if (!compact()) {
          <button
            type="button"
            class="btn sm icon"
            aria-label="Bloquear la disposición"
            [attr.aria-pressed]="locked()"
            [attr.title]="lockTitle()"
            (click)="toggleLock()"
          >
            <i
              class="pi"
              [class.pi-lock]="locked()"
              [class.pi-lock-open]="!locked()"
              aria-hidden="true"
            ></i>
          </button>
        }
      </div>
    </header>

    @if (store.error(); as message) {
      <p class="alert" role="alert">
        <span>{{ message }}</span>
        <button type="button" class="close" (click)="store.error.set('')">Cerrar</button>
      </p>
    }

    @if (showDone()) {
      <app-notes-finished [cards]="store.finished()" (recovered)="store.recover($event)" />
    }

    @if (store.loading()) {
      @if (compact()) {
        <app-notes-skeleton compact />
      } @else {
        <div class="board loading" aria-busy="true" [style.min-height.px]="boardHeight()">
          <app-notes-skeleton />
        </div>
      }
    } @else if (compact()) {
      <app-notes-mobile-list
        [editingId]="editingId()"
        [empty]="isEmpty()"
        (toggled)="toggleDone($event)"
        (edited)="edit($event)"
        (finished)="finishEdit($event.card, $event.value)"
        (removed)="removeCard($event)"
        (created)="newCard()"
      />
    } @else {
      <div
        #board
        class="board"
        role="application"
        aria-label="Lienzo de notas"
        [class.active]="zoneVisible()"
        [style.min-height.px]="boardHeight()"
        [style.--board-right]="boardRight() + 'px'"
        (pointerdown)="onBoardPointerDown($event, board)"
        (dblclick)="onBoardDblClick($event, board)"
      >
        @if (isEmpty()) {
          <p class="empty board-empty">
            Un folio en blanco.<br />Escribe arriba o haz doble clic para crear la primera nota.
          </p>
        }

        @for (group of layoutGroups(); track group.id) {
          <app-note-group
            [group]="group"
            [box]="groupBox(group)"
            [count]="cardsIn(group.id).length"
            [dropTarget]="drag()?.over === group.id"
            [moving]="isMoving(group.id)"
            [locked]="locked()"
            (pointerdown)="onGroupPointerDown($event)"
            (headerPressed)="startGroupDrag($event, group)"
            (resizePressed)="startResize($event, group)"
            (renamed)="store.patchGroup(group.id, { title: $event })"
            (dissolved)="dissolve(group)"
            (dblclick)="onGroupDblClick($event, group)"
          >
            @for (card of cardsIn(group.id); track card.id) {
              <ng-container
                [ngTemplateOutlet]="cardTpl"
                [ngTemplateOutletContext]="{ $implicit: card, stacked: true }"
              />
            }
          </app-note-group>
        }

        @for (card of store.looseCards(); track card.id) {
          <ng-container
            [ngTemplateOutlet]="cardTpl"
            [ngTemplateOutletContext]="{ $implicit: card }"
          />
        }

        @for (g of ghosts(); track g.card.id) {
          <app-note-card ghost [card]="g.card" [landing]="g.landing" />
        }

        @if (marquee(); as m) {
          <div
            class="marquee"
            [style.left.px]="m.x"
            [style.top.px]="m.y"
            [style.width.px]="m.w"
            [style.height.px]="m.h"
          ></div>
        }
      </div>

      @if (drag()?.moved) {
        <div class="drag-shield" [class.resize]="drag()?.kind === 'resize'"></div>
      }

      <app-notes-hints [selectedCount]="selectionCount()" [locked]="locked()" />
    }

    @if (lockNotice() || store.undoNotice()) {
      <div class="toasts">
        @if (lockNotice()) {
          <div class="undo" role="status">
            <span>Disposición bloqueada · Desbloquea para mover</span>
            <button type="button" (click)="setLocked(false)">Desbloquear</button>
            <button
              type="button"
              class="dismiss"
              aria-label="Cerrar aviso"
              (click)="dismissLockNotice()"
            >
              ×
            </button>
          </div>
        }
        @if (store.undoNotice(); as notice) {
          <div class="undo" role="status">
            <span>{{ notice }}</span>
            <button type="button" (click)="store.undo()">Deshacer</button>
            <button
              type="button"
              class="dismiss"
              aria-label="Cerrar aviso"
              (click)="store.dismissUndoNotice()"
            >
              ×
            </button>
          </div>
        }
      </div>
    }

    <ng-template #cardTpl let-card let-stacked="stacked">
      <app-note-card
        [card]="card"
        [stacked]="!!stacked"
        [selected]="selected().has(card.id)"
        [dragging]="isDragging(card.id)"
        [settling]="isSettling(card.id)"
        [editing]="editingId() === card.id"
        [caption]="doneCaption(card)"
        [toolbar]="showToolbar(card)"
        [toolbarBelow]="absolute(card).y < 56"
        [locked]="locked()"
        (pressed)="startCardDrag($event, card)"
        (focused)="onCardFocus(card)"
        (edited)="edit(card)"
        (finished)="finishEdit(card, $event)"
        (toggled)="toggleDone(card)"
        (groupSelected)="groupSelection()"
        (removed)="removeCard(card)"
      />
    </ng-template>
  `,
})
export class NotesPage {
  protected readonly store = inject(NoteBoardStore);
  private readonly bus = inject(RefreshBus);
  private readonly palette = inject(PaletteService);
  private readonly boardRef = viewChild<ElementRef<HTMLElement>>('board');
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly today = formatNoteDate(new Date());

  protected readonly compact = signal(false);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly editingId = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  protected readonly showDone = signal(false);
  /** Disposición bloqueada: no se mueven ni redimensionan tarjetas y grupos. Se arranca como la dejó el usuario (por defecto, bloqueada). */
  protected readonly locked = signal(readLayoutLocked());
  protected readonly lockNotice = signal(false);
  /** Lo que ocupa todo lo que hay encima de la pantalla (cabecera y captura), para llenar el resto de la ventana. */
  protected readonly top = signal(0);
  /** Marco de selección con el ratón, en coordenadas del lienzo. */
  protected readonly marquee = signal<Rect | null>(null);
  /** Tarjetas recién soltadas que aún se están asentando (la copia que volaba baja a su sitio). */
  private readonly landing = signal<NoteCard[] | null>(null);
  /** Parte baja de las tarjetas tal como se pintan (el texto largo las hace más altas que la estimación). */
  private readonly measuredBottom = signal(0);
  /** Alto real de cada grupo y sitio real de cada tarjeta en el lienzo (las de un grupo van apiladas, sin x/y propias). */
  private readonly groupHeights = signal<ReadonlyMap<string, number>>(new Map());
  private readonly slots = signal<ReadonlyMap<string, Rect>>(new Map());

  private landingTimer: ReturnType<typeof setTimeout> | undefined;
  private lockNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Último puntero visto durante el arrastre, para recolocar la tarjeta si la pantalla se desplaza. */
  private lastPointer: { clientX: number; clientY: number } | null = null;
  private stopDragListeners: (() => void) | null = null;
  private stopMarqueeListeners: (() => void) | null = null;

  protected readonly isEmpty = computed(
    () =>
      !this.store.loading() &&
      this.store.visibleCards().length === 0 &&
      this.store.groups().length === 0,
  );

  /** Seleccionadas que se ven de verdad (una hecha que caduca deja de contar aunque siga en el conjunto). */
  protected readonly selectionCount = computed(() => {
    const ids = this.selected();
    return this.store.visibleCards().reduce((n, card) => n + (ids.has(card.id) ? 1 : 0), 0);
  });

  /** Grupos con el alto con el que se pintan: los que tienen tarjetas crecen para contenerlas. */
  protected readonly layoutGroups = computed<NoteGroup[]>(() => {
    const heights = this.groupHeights();
    const byGroup = this.store.cardsByGroup();
    return this.store
      .groups()
      .map((group) =>
        byGroup.has(group.id) ? { ...group, h: heights.get(group.id) ?? group.h } : group,
      );
  });

  protected readonly boardHeight = computed(() => {
    const bottoms = [
      ...this.store.looseCards().map((card) => card.y + CARD_ESTIMATED_HEIGHT),
      ...this.layoutGroups().map((group) => group.y + group.h),
      this.measuredBottom(),
    ];
    return Math.max(240, ...bottoms) + 160;
  });

  /** Hasta dónde llega el lienzo por la derecha: lo más lejano más un margen (el resto lo da el ancho de la ventana). */
  protected readonly boardRight = computed(
    () => rightEdge(this.store.looseCards(), this.layoutGroups()) + RIGHT_SPARE,
  );

  /** El contorno de la zona solo se ve mientras se arrastra o redimensiona algo, o se dibuja el marco. */
  protected readonly zoneVisible = computed(
    () => this.drag()?.moved === true || this.marquee() !== null,
  );

  /** Tarjetas que «vuelan» bajo el puntero mientras se arrastran, o que acaban de soltarse. */
  protected readonly ghosts = computed<Ghost[]>(() => {
    const landing = this.landing();
    if (landing) return landing.map((card) => ({ card, landing: true }));
    const drag = this.drag();
    if (drag?.kind !== 'card' || !drag.moved) return [];
    return dragPreview(drag, this.store.visibleCards(), this.selected(), (card) =>
      this.absolute(card),
    ).map((card) => ({ card, landing: false }));
  });

  private readonly flying = computed(
    () =>
      new Set(
        this.ghosts()
          .filter((g) => !g.landing)
          .map((g) => g.card.id),
      ),
  );
  private readonly settling = computed(
    () =>
      new Set(
        this.ghosts()
          .filter((g) => g.landing)
          .map((g) => g.card.id),
      ),
  );

  constructor() {
    this.store.load();
    this.store.loadDoneOld();

    // Un cambio externo (captura rápida) recarga el lienzo.
    effect(() => {
      if (this.bus.version() === 0) return;
      untracked(() => {
        this.store.load();
        this.store.loadDoneOld();
      });
    });

    // «Nueva nota» de la paleta (Ctrl+K) crea una tarjeta vacía y llega aquí con su id: se enfoca para escribir.
    effect(() => {
      const id = this.palette.newNoteId();
      if (id === null || !this.store.cards().some((card) => card.id === id)) return;
      untracked(() => {
        this.selected.set(new Set([id]));
        this.editingId.set(id);
        this.palette.newNoteId.set(null);
      });
    });

    // El lienzo crece con las tarjetas más altas de lo estimado; se mide tras pintar, nunca durante un arrastre.
    afterRenderEffect(() => {
      this.store.cards();
      this.store.groups();
      this.editingId();
      this.compact();
      this.store.loading();
      const board = this.boardRef()?.nativeElement;
      untracked(() => {
        if (!board) return this.measuredBottom.set(0);
        if (this.drag()?.moved) return;
        this.measureBoard(board);
      });
    });

    // La ventana se llena por debajo de la cabecera y la captura: se mide lo que hay encima, tras pintar y al cambiar el tamaño.
    afterRenderEffect(() => {
      this.compact();
      this.store.loading();
      untracked(() => this.measureTop());
    });
    const onResize = () => this.measureTop();
    window.addEventListener('resize', onResize);
    // La franja de captura puede crecer (vista previa): el cuerpo cambia de alto y la altura mínima se recalcula.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    observer?.observe(document.body);

    // Las tarjetas hechas hace más de 24 h se ocultan solas aunque la pantalla siga abierta.
    const interval = setInterval(() => this.store.tick(), 30_000);

    // En pantallas estrechas no hay lienzo: se muestra una lista.
    const query = window.matchMedia(MOBILE_QUERY);
    this.compact.set(query.matches);
    const onChange = (event: MediaQueryListEvent) => this.compact.set(event.matches);
    query.addEventListener('change', onChange);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      clearTimeout(this.landingTimer);
      clearTimeout(this.lockNoticeTimer);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      query.removeEventListener('change', onChange);
      this.stopDragListeners?.();
      this.stopMarqueeListeners?.();
    });
  }

  // ---------- Consultas de la plantilla ----------

  protected cardsIn(groupId: string): NoteCard[] {
    return this.store.cardsByGroup().get(groupId) ?? [];
  }

  protected isDragging(id: string): boolean {
    return this.flying().has(id);
  }

  protected isSettling(id: string): boolean {
    return this.settling().has(id);
  }

  protected isMoving(groupId: string): boolean {
    const drag = this.drag();
    return drag?.kind === 'group' && drag.moved && drag.id === groupId;
  }

  /** Posición y tamaño de un grupo, con el efecto del arrastre o del redimensionado en curso. */
  protected groupBox(group: NoteGroup): { x: number; y: number; w: number; h: number } {
    const drag = this.drag();
    if (drag && drag.id === group.id && (drag.kind === 'group' || drag.kind === 'resize')) {
      return { x: drag.x, y: drag.y, w: drag.w, h: drag.h };
    }
    return { x: group.x, y: group.y, w: group.w, h: group.h };
  }

  protected lockTitle(): string {
    return this.locked()
      ? 'Disposición bloqueada: no se pueden mover las notas. Pulsa para desbloquear'
      : 'Disposición desbloqueada: pulsa para bloquearla y evitar mover notas sin querer';
  }

  protected doneCaption(card: NoteCard): string {
    if (!card.doneAt) return '';
    return `Hecha · se oculta en ${formatDuration(remainingMs(card.doneAt, this.store.now()))}`;
  }

  /** La barra de acciones solo sale con una tarjeta seleccionada y sin arrastrar ni editar. */
  protected showToolbar(card: NoteCard): boolean {
    return (
      this.selectionCount() === 1 &&
      this.selected().has(card.id) &&
      this.editingId() === null &&
      !this.drag()?.moved &&
      this.landing() === null
    );
  }

  private measureTop(): void {
    const top = Math.max(0, Math.round(this.hostEl.getBoundingClientRect().top + window.scrollY));
    if (top !== this.top()) this.top.set(top);
  }

  private measureBoard(board: HTMLElement): void {
    const top = board.getBoundingClientRect().top;
    let bottom = 0;
    for (const el of board.querySelectorAll<HTMLElement>('[data-card-id]')) {
      bottom = Math.max(bottom, el.getBoundingClientRect().bottom - top);
    }
    const next = Math.ceil(bottom);
    if (Math.abs(next - this.measuredBottom()) >= 1) this.measuredBottom.set(next);

    const left = board.getBoundingClientRect().left - board.scrollLeft;
    const slots = new Map<string, Rect>();
    for (const el of board.querySelectorAll<HTMLElement>('[data-card-id]')) {
      const r = el.getBoundingClientRect();
      slots.set(el.dataset['cardId']!, {
        x: Math.round(r.left - left),
        y: Math.round(r.top - top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
    if (!sameRects(slots, this.slots())) this.slots.set(slots);

    const heights = new Map<string, number>();
    for (const el of board.querySelectorAll<HTMLElement>('app-note-group[data-group-id]')) {
      heights.set(el.dataset['groupId']!, el.offsetHeight);
    }
    if (!sameNumbers(heights, this.groupHeights())) this.groupHeights.set(heights);
  }

  // ---------- Bloqueo y orden ----------

  protected toggleLock(): void {
    this.setLocked(!this.locked());
  }

  protected setLocked(value: boolean): void {
    this.locked.set(value);
    writeLayoutLocked(value);
    this.dismissLockNotice();
  }

  protected dismissLockNotice(): void {
    clearTimeout(this.lockNoticeTimer);
    this.lockNotice.set(false);
  }

  /** Aviso discreto y breve cuando alguien intenta mover algo con la disposición bloqueada. */
  private showLockNotice(): void {
    clearTimeout(this.lockNoticeTimer);
    this.lockNotice.set(true);
    this.lockNoticeTimer = setTimeout(() => this.lockNotice.set(false), LOCK_NOTICE_MS);
  }

  /**
   * «Ordenar»: rejilla limpia con las tarjetas sueltas y los grupos, en su orden de lectura y al ancho
   * real del lienzo. Se usan las alturas reales de las tarjetas (el texto largo las hace más altas que
   * la estimación) para que no se solape nada. Funciona también con la disposición bloqueada.
   */
  protected arrange(): void {
    const board = this.boardRef()?.nativeElement;
    if (!board || this.compact()) return;
    const heights = new Map<string, number>();
    for (const el of board.querySelectorAll<HTMLElement>('[data-card-id]')) {
      heights.set(el.dataset['cardId']!, el.offsetHeight);
    }
    const items = arrangeItems(this.store.looseCards(), this.layoutGroups(), heights);
    if (this.store.arrange(arrangeInGrid(items, board.clientWidth))) board.scrollLeft = 0;
  }

  // ---------- Crear, editar, terminar, borrar ----------

  /** Primer hueco libre según el ancho real del lienzo (el servidor, sin posición, supone 1240 px). */
  private freeSpot(): { x: number; y: number } | null {
    const board = this.boardRef()?.nativeElement;
    if (!board || this.compact()) return null;
    return freeSlot(this.store.looseCards(), this.layoutGroups(), board.clientWidth);
  }

  protected newCard(at?: { x: number; y: number; groupId?: string }): void {
    const spot = at ?? this.freeSpot();
    this.store
      .createCard({ text: '', ...(spot && { x: spot.x, y: spot.y, groupId: at?.groupId ?? null }) })
      .subscribe((card) => {
        this.selected.set(new Set([card.id]));
        this.editingId.set(card.id);
      });
  }

  protected onBoardDblClick(event: MouseEvent, board: HTMLElement): void {
    if (event.target !== event.currentTarget) return;
    const rect = board.getBoundingClientRect();
    this.newCard({
      x: clampCoord(event.clientX - rect.left + board.scrollLeft),
      y: clampCoord(event.clientY - rect.top),
    });
  }

  /** Doble clic en el hueco del grupo: la nota nueva entra al final de su pila. */
  protected onGroupDblClick(event: MouseEvent, group: NoteGroup): void {
    if (!isGroupBackground(event)) return;
    this.newCard({ x: 0, y: stackEndY(this.cardsIn(group.id)), groupId: group.id });
  }

  protected dissolve(group: NoteGroup): void {
    const positions = new Map<string, Point>();
    for (const card of this.cardsIn(group.id)) positions.set(card.id, this.absolute(card));
    this.store.dissolveGroup(group.id, positions);
  }

  protected edit(card: NoteCard): void {
    this.selected.set(new Set([card.id]));
    this.editingId.set(card.id);
  }

  protected finishEdit(card: NoteCard, value: string): void {
    if (this.editingId() === card.id) this.editingId.set(null);
    // La tarjeta pudo borrarse mientras se editaba (el campo avisa al perder el foco al desaparecer).
    if (!this.store.cards().some((c) => c.id === card.id)) return;
    // Una nota nueva que se deja en blanco no se guarda (y no ofrece «Deshacer»).
    if (value.trim() === '' && card.text === '') {
      this.store.removeCards([card.id], { undoable: false });
      this.selected.update((set) => new Set([...set].filter((id) => id !== card.id)));
      return;
    }
    if (value !== card.text) this.store.patchCard(card.id, { text: value });
  }

  protected toggleDone(card: NoteCard): void {
    this.store.patchCard(card.id, { done: !card.doneAt });
  }

  protected toggleDoneSelected(): void {
    const cards = this.selectedCards();
    const allDone = cards.every((card) => card.doneAt);
    for (const card of cards) this.store.patchCard(card.id, { done: !allDone });
  }

  protected removeCard(card: NoteCard): void {
    if (this.editingId() === card.id) this.editingId.set(null);
    this.store.removeCard(card.id);
    this.selected.update((set) => new Set([...set].filter((id) => id !== card.id)));
  }

  protected toggleDonePanel(): void {
    const next = !this.showDone();
    this.showDone.set(next);
    if (next) this.store.loadDoneOld();
  }

  // ---------- Selección ----------

  private selectedCards(): NoteCard[] {
    const ids = this.selected();
    return this.store.visibleCards().filter((card) => ids.has(card.id));
  }

  protected onCardFocus(card: NoteCard): void {
    if (!this.selected().has(card.id)) this.selected.set(new Set([card.id]));
  }

  /** Pulsar en el hueco de un grupo (no en sus notas ni en su cabecera) deselecciona, como en el fondo. */
  protected onGroupPointerDown(event: PointerEvent): void {
    if (!isGroupBackground(event) || event.button !== 0) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    this.selected.set(new Set());
    this.editingId.set(null);
  }

  /** Pulsar en el fondo deselecciona; arrastrar dibuja un marco que selecciona lo que toca. */
  protected onBoardPointerDown(event: PointerEvent, board: HTMLElement): void {
    if (event.target !== event.currentTarget || event.button !== 0 || !event.isPrimary) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const base: ReadonlySet<string> = additive ? this.selected() : new Set();
    if (!additive) this.selected.set(new Set());
    this.editingId.set(null);

    this.stopMarqueeListeners?.();
    const start = { x: event.clientX, y: event.clientY };
    let moving = false;

    const move = (e: PointerEvent) => {
      if (
        !moving &&
        Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < MARQUEE_THRESHOLD
      ) {
        return;
      }
      moving = true;
      const frame = rectBetween(start, { x: e.clientX, y: e.clientY });
      const bounds = board.getBoundingClientRect();
      this.marquee.set({
        x: frame.x - bounds.left + board.scrollLeft,
        y: frame.y - bounds.top,
        w: frame.w,
        h: frame.h,
      });
      // Las tarjetas de un grupo no se seleccionan con el marco: el grupo se trata como un todo.
      const items = Array.from(
        board.querySelectorAll<HTMLElement>('[data-card-id]:not([data-stacked])'),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.dataset['cardId']!,
          rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        };
      });
      this.selected.set(idsTouchedBy(frame, items, base));
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      this.stopMarqueeListeners = null;
      this.marquee.set(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    this.stopMarqueeListeners = end;
  }

  private select(id: string, additive: boolean): void {
    this.selected.update((set) => {
      if (additive) {
        const next = new Set(set);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return set.has(id) ? set : new Set([id]);
    });
  }

  // ---------- Arrastre ----------

  protected absolute(card: NoteCard): Point {
    if (!card.groupId) return { x: card.x, y: card.y };
    // En un grupo la posición no es la guardada: manda el sitio que ocupa en la pila.
    const slot = this.slots().get(card.id);
    if (slot) return { x: slot.x, y: slot.y };
    const group = this.store.groups().find((g) => g.id === card.groupId);
    return group ? toAbsolute(card, group) : { x: card.x, y: card.y };
  }

  /**
   * Puntero en coordenadas del lienzo: si el lienzo o la página se desplazan durante el arrastre, la
   * tarjeta sigue pegada al puntero y no se queda atrás.
   */
  private pointerOf(event: { clientX: number; clientY: number }): Point {
    const board = this.boardRef()?.nativeElement;
    return { x: event.clientX + (board?.scrollLeft ?? 0), y: event.clientY + window.scrollY };
  }

  private beginDrag(drag: Drag, event: PointerEvent): void {
    this.cancelLanding();
    this.stopDragListeners?.();
    this.lastPointer = event;
    this.drag.set(drag);

    const move = (e: PointerEvent) => {
      this.lastPointer = e;
      this.onDragMove();
    };
    const reflow = () => this.onDragMove();
    const noSelect = (e: Event) => e.preventDefault();
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('selectstart', noSelect);
      window.removeEventListener('scroll', reflow, true);
      this.stopDragListeners = null;
    };
    const finish = (commit: boolean) => () => {
      cleanup();
      this.endDrag(commit);
    };
    const up = finish(true);
    const cancel = finish(false);
    // Escape cancela el arrastre y la tarjeta vuelve a su sitio.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cancel();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', onKey);
    document.addEventListener('selectstart', noSelect);
    window.addEventListener('scroll', reflow, { capture: true, passive: true });
    this.stopDragListeners = cleanup;
  }

  /**
   * Con la disposición bloqueada no hay arrastre: se vigila el puntero solo para avisar si el gesto era
   * un intento de mover (supera el mismo umbral que el arrastre). Si no, es un clic y se llama a `onClick`.
   */
  private watchLockedPress(event: PointerEvent, onClick?: () => void): void {
    this.stopDragListeners?.();
    const start = { x: event.clientX, y: event.clientY };
    let attempted = false;
    const move = (e: PointerEvent) => {
      if (attempted) return;
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < DRAG_THRESHOLD) return;
      attempted = true;
      this.showLockNotice();
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      this.stopDragListeners = null;
    };
    const up = () => {
      cleanup();
      if (!attempted) onClick?.();
    };
    const cancel = () => cleanup();
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    this.stopDragListeners = cleanup;
  }

  protected startCardDrag(event: PointerEvent, card: NoteCard): void {
    if (event.button !== 0 || !event.isPrimary || this.editingId() === card.id) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.select(card.id, additive);
    if (additive) return; // Mayús+clic solo cambia la selección.
    if (this.locked()) {
      // Un clic sin movimiento deja solo esta tarjeta seleccionada; si se intenta arrastrar, se avisa.
      this.watchLockedPress(event, () => this.selected.set(new Set([card.id])));
      return;
    }
    const abs = this.absolute(card);
    const box = { x: abs.x, y: abs.y, w: card.w, h: 0 };
    this.beginDrag(startDrag('card', card.id, this.pointerOf(event), box), event);
  }

  protected startGroupDrag(event: PointerEvent, group: NoteGroup): void {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    if (this.locked()) {
      this.watchLockedPress(event);
      return;
    }
    this.beginDrag(startDrag('group', group.id, this.pointerOf(event), group), event);
  }

  protected startResize(event: PointerEvent, group: NoteGroup): void {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    if (this.locked()) {
      this.watchLockedPress(event);
      return;
    }
    this.beginDrag(startDrag('resize', group.id, this.pointerOf(event), group), event);
  }

  private onDragMove(): void {
    const drag = this.drag();
    const pointer = this.lastPointer;
    if (drag && pointer) {
      this.drag.set(advanceDrag(drag, this.pointerOf(pointer), this.layoutGroups()));
    }
  }

  private cancelLanding(): void {
    clearTimeout(this.landingTimer);
    this.landing.set(null);
  }

  /** Mantiene un instante las tarjetas soltadas encima de las reales para que la sombra y la escala se asienten. */
  private land(cards: NoteCard[]): void {
    clearTimeout(this.landingTimer);
    this.landing.set(cards);
    this.landingTimer = setTimeout(() => this.landing.set(null), LAND_MS);
  }

  private endDrag(commit: boolean): void {
    const drag = this.drag();
    this.drag.set(null);
    this.lastPointer = null;
    if (!drag) return;

    if (!drag.moved) {
      // Un clic sobre una tarjeta de una selección múltiple deja solo esa tarjeta.
      if (drag.kind === 'card' && !drag.additive) this.selected.set(new Set([drag.id]));
      return;
    }
    if (!commit) return;

    if (drag.kind === 'resize') {
      const { originW: w, originH: h } = drag;
      this.store.patchGroup(drag.id, { w: drag.w, h: drag.h });
      this.store.record(() => this.store.patchGroup(drag.id, { w, h }));
    } else if (drag.kind === 'group') {
      const { originX: x, originY: y } = drag;
      this.store.patchGroup(drag.id, { x: drag.x, y: drag.y });
      this.store.record(() => this.store.patchGroup(drag.id, { x, y }));
    } else {
      const visible = this.store.visibleCards();
      const absolute = (card: NoteCard) => this.absolute(card);
      const preview = dragPreview(drag, visible, this.selected(), absolute);
      const heightOf = (card: NoteCard) => this.slots().get(card.id)?.h ?? CARD_ESTIMATED_HEIGHT;
      const moves = dropMoves(
        drag,
        visible,
        this.selected(),
        this.layoutGroups(),
        absolute,
        heightOf,
      );
      if (moves.length > 0) {
        this.store.moveCards({ moves }, { undo: true });
        this.land(preview);
      }
    }
  }

  // ---------- Grupos ----------

  protected groupSelection(): void {
    const cards = this.selectedCards();
    const around = groupAround(cards, (card) => this.absolute(card));
    if (!around) return;
    this.store.createGroup({ title: '', ...around.group }).subscribe((group) => {
      this.store.adoptCards(
        group,
        cards.map((card, index) => {
          const rel = toRelative({ x: around.rects[index]!.x, y: around.rects[index]!.y }, group);
          return { id: card.id, x: rel.x, y: rel.y, groupId: group.id };
        }),
      );
    });
  }

  // ---------- Teclado ----------

  protected onKeydown(event: KeyboardEvent): void {
    if (
      this.compact() ||
      this.drag() ||
      event.defaultPrevented ||
      this.palette.isOpen() ||
      isEditable(event.target)
    ) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (key === 'z' && mod && !event.altKey && !event.shiftKey) {
      if (this.store.undo()) event.preventDefault();
      return;
    }
    // Mayús+N es el atajo global a Notas (ver go-shortcuts.ts): aquí «N» a secas crea la tarjeta.
    if (key === 'n' && !mod && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) this.newCard();
      return;
    }
    if (key === 'escape') {
      this.selected.set(new Set());
      return;
    }
    if (this.selectionCount() === 0) return;

    const step = arrowMove(event);
    if (key === 'g' && mod) {
      event.preventDefault();
      if (!event.repeat) this.groupSelection();
    } else if (key === 'x' && !mod) {
      if (!event.repeat) this.toggleDoneSelected();
    } else if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      const ids = this.selectedCards().map((card) => card.id);
      this.store.removeCards(ids);
      this.selected.set(new Set());
    } else if (key === 'enter' && this.selectionCount() === 1 && !isControl(event.target)) {
      event.preventDefault();
      const card = this.selectedCards()[0];
      if (card) this.edit(card);
    } else if (step) {
      // Mayús+flechas mueve la selección. Alt+flechas es la navegación global entre secciones: aquí no se toca.
      event.preventDefault();
      if (this.locked()) {
        this.showLockNotice();
        return;
      }
      const { dx, dy } = step;
      // Las de un grupo no se colocan libremente.
      const movable = this.selectedCards().filter((card) => card.groupId === null);
      if (movable.length === 0) return;
      this.store.moveCards(
        {
          moves: movable.map((card) => ({
            id: card.id,
            x: clampCoord(card.x + dx),
            y: clampCoord(card.y + dy),
          })),
        },
        { undo: true },
      );
    }
  }
}
