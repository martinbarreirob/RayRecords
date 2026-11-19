import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { selectionLabel } from './note-board.logic';
import { paginateHints, type HintPage } from './notes-hints.logic';
import { readHintsOpen, writeHintsOpen } from './notes-prefs';
import { Icon } from '../../core/ui/icon';

interface Hint {
  keys: string;
  text: string;
}

/** Only the essentials. With a locked layout, moving is not mentioned. */
const HINTS: readonly Hint[] = [
  { keys: '', text: 'Arrastra para colocar' },
  { keys: 'Mayús+clic', text: 'o marco: varias' },
  { keys: 'Ctrl G', text: 'agrupa' },
  { keys: 'X', text: 'hecha' },
  { keys: 'Supr', text: 'borra' },
  { keys: 'Ctrl Z', text: 'deshace' },
  { keys: 'Mayús+flechas', text: 'mueve' },
];

const LOCKED_HINTS: readonly Hint[] = [
  { keys: '', text: 'Disposición bloqueada: desbloquea con el candado para mover' },
  ...HINTS.filter((hint) => !['Arrastra para colocar', 'mueve'].includes(hint.text)),
];

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Footer of the notes box: the shortcuts on one line and, on the right, a text button that hides
 * them (it is remembered). Only whole shortcuts that fit are shown; when some are left out, an arrow
 * steps through the rest. With several notes selected the selection pill is added. When hidden,
 * the row stays with the same button in the same corner, now to show them again.
 */
@Component({
  selector: 'app-notes-hints',
  imports: [Icon],
  styles: `
    /* No box of its own: the bar is a direct child of the notes box and sticks to the bottom edge. */
    :host {
      display: contents;
    }

    /* Opaque and below the canvas, never over it: the notes always keep their distance. */
    .bar {
      position: sticky;
      bottom: 0;
      z-index: var(--z-nav);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 36px;
      /* Inside the outline of the box, which is an inner shadow one pixel wide. */
      margin: 0 1px 1px;
      padding: var(--space-1) var(--space-3);
      border-radius: 0 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px);
      background: var(--bg);
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .list {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-4);
      overflow: hidden;
      white-space: nowrap;
    }

    .hint {
      position: relative;
      flex: none;
    }

    /* Out of the current page: still measurable, but neither seen nor taking space. */
    .hint.off {
      position: absolute;
      top: 0;
      left: 0;
      visibility: hidden;
    }

    /* The dot sits in the middle of the gap and adds no width. */
    .hint.sep::before {
      content: '·';
      position: absolute;
      left: calc(var(--space-4) / -2);
      translate: -50% 0;
      opacity: 0.6;
    }

    .hint .kbd {
      margin-right: 2px;
      font-size: 10px;
    }

    .pill {
      flex: none;
      padding: 2px var(--space-3);
      border-radius: var(--radius-pill);
      background: var(--accent);
      color: var(--on-accent);
      font-weight: 500;
    }

    .more,
    .toggle {
      flex: none;
      min-height: 24px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .more {
      display: grid;
      place-items: center;
      width: 24px;
      padding: 0;
      border-radius: var(--radius-pill);
    }

    /* The arrow keeps its place when it is not needed, so showing it never changes what fits. */
    .more.idle {
      visibility: hidden;
    }

    .more:hover {
      background: var(--surface-2);
      color: var(--text);
    }

    /* Always the last thing on the row: the same corner whether the shortcuts show or not. */
    .toggle {
      margin-left: auto;
      padding: 0 var(--space-1);
    }

    .toggle:hover {
      color: var(--text);
      text-decoration: underline;
    }

    @media (hover: none) {
      .toggle {
        min-height: var(--touch-target);
        padding: 0 var(--space-3);
      }

      .more {
        width: var(--touch-target);
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <div class="bar" role="note">
      @if (selectedCount() > 1) {
        <span class="pill" role="status">{{ label() }} · Ctrl G agrupa</span>
      }
      @if (open()) {
        <div #list class="list">
          @for (hint of hints(); track hint.text; let i = $index) {
            <span class="hint" [class.off]="!shown(i)" [class.sep]="shown(i) && i > current().from">
              @if (hint.keys) {
                <span class="kbd">{{ hint.keys }}</span>
              }
              {{ hint.text }}
            </span>
          }
        </div>
        <button
          type="button"
          class="more"
          [class.idle]="pages().length < 2"
          [attr.aria-label]="moreLabel()"
          [attr.title]="moreLabel()"
          (click)="nextPage()"
        >
          <app-icon [name]="!onLastPage() ? 'chevron-right' : 'chevrons-left'" />
        </button>
      }
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.title]="open() ? 'Ocultar los atajos' : 'Mostrar los atajos'"
        (click)="setOpen(!open())"
      >
        {{ open() ? 'Ocultar' : 'Atajos' }}
      </button>
    </div>
  `,
})
export class NotesHints {
  readonly selectedCount = input(0);
  readonly locked = input(false);

  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly hints = computed(() => (this.locked() ? LOCKED_HINTS : HINTS));
  protected readonly open = signal(readHintsOpen());

  /** Natural width of every hint, the gap between them and the room there is, as painted. */
  private readonly widths = signal<readonly number[]>([], { equal: sameList });
  private readonly gap = signal(0);
  private readonly available = signal(0);

  protected readonly pages = computed<HintPage[]>(() => {
    const count = this.hints().length;
    const widths = this.widths();
    // Not measured yet (or measured for another set of hints): everything on one page.
    if (widths.length !== count) return [{ from: 0, to: count }];
    return paginateHints(widths, this.gap(), this.available());
  });

  /** Back to the first page whenever the set of hints changes. */
  private readonly page = linkedSignal({ source: this.hints, computation: () => 0 });

  private readonly pageIndex = computed(() => Math.min(this.page(), this.pages().length - 1));
  protected readonly current = computed(() => this.pages()[this.pageIndex()]!);
  protected readonly onLastPage = computed(() => this.pageIndex() === this.pages().length - 1);

  constructor() {
    let observed: HTMLElement | undefined;
    const remeasure = () => this.measure(this.listRef()?.nativeElement);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);

    // Measured after painting; the pill and the set of hints change what fits.
    afterRenderEffect(() => {
      this.hints();
      this.selectedCount();
      const list = this.listRef()?.nativeElement;
      untracked(() => {
        if (list !== observed) {
          observer?.disconnect();
          if (list) observer?.observe(list);
          observed = list;
        }
        this.measure(list);
      });
    });

    // The web font arrives later and changes the widths without resizing the list.
    void document.fonts?.ready.then(remeasure);

    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }

  protected label(): string {
    return selectionLabel(this.selectedCount());
  }

  protected shown(index: number): boolean {
    const { from, to } = this.current();
    return index >= from && index < to;
  }

  protected moreLabel(): string {
    return this.onLastPage() ? 'Volver a los primeros atajos' : 'Ver más atajos';
  }

  protected nextPage(): void {
    this.page.set((this.pageIndex() + 1) % this.pages().length);
  }

  protected setOpen(value: boolean): void {
    this.open.set(value);
    writeHintsOpen(value);
  }

  private measure(list: HTMLElement | undefined): void {
    if (!list) return;
    this.widths.set(
      Array.from(list.querySelectorAll<HTMLElement>('.hint'), (el) =>
        Math.ceil(el.getBoundingClientRect().width),
      ),
    );
    this.gap.set(parseFloat(getComputedStyle(list).columnGap) || 0);
    this.available.set(list.clientWidth);
  }
}
