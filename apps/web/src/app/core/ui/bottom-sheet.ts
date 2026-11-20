import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

/** Closed (out of sight), peek (only its head shows) and expanded (open over a dimmed page). */
export type SheetState = 'closed' | 'peek' | 'expanded';

/** Pixels the finger must travel before a press on the head counts as a drag. */
const DRAG_SLOP = 6;
/** Pixels of drag that are enough to change state. */
const DRAG_COMMIT = 60;
/** Used for the peek height until the head has been measured. */
const PEEK_FALLBACK = 140;
/** Controls inside the head that keep their own click: a press on them never starts a drag. */
const OWN_CONTROLS = 'button:not(.toggle), a, input, select, textarea';

let nextId = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A sheet that rises from the bottom edge of a phone. The head is always what shows first: a grip,
 * the content projected as `[sheetHeader]` (inside the toggle button) and `[sheetPeek]` (summary
 * and actions, only while peeking). The rest is the body, shown when expanded.
 *
 * The state is a two-way `state`. A tap on the toggle goes between peek and expanded; dragging the
 * head up or down moves it a step; a tap outside, the dim backdrop or Escape close it. With
 * `collapsible` off there is no peek: the toggle and a drag down close it. Closed, it is `inert`.
 */
@Component({
  selector: 'app-bottom-sheet',
  host: { class: 'sheet-host' },
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: calc(var(--z-popover) - 1);
      background: transparent;
      /* Peeking leaves the page usable (scroll, tap another row); only expanded blocks it. */
      pointer-events: none;
      transition: background-color 0.25s ease-out;

      &.dim {
        background: color-mix(in srgb, var(--text) 40%, transparent);
        pointer-events: auto;
      }

      &.off {
        visibility: hidden;
        pointer-events: none;
        transition: none;
        background: transparent;
      }
    }

    .sheet {
      --sheet-drag: 0px;
      --sheet-peek: 140px;
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: var(--z-popover);
      display: flex;
      flex-direction: column;
      max-height: min(88dvh, 720px);
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      background: var(--surface);
      box-shadow: var(--shadow-lg);
      outline: none;
      transform: translateY(
        calc(100% - var(--sheet-peek) - env(safe-area-inset-bottom, 0px) + var(--sheet-drag))
      );
      transition:
        transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
        visibility 0s;
      will-change: transform;

      &.is-expanded {
        transform: translateY(var(--sheet-drag));
      }

      &.is-closed {
        visibility: hidden;
        transform: translateY(calc(100% + var(--sheet-drag)));
        transition:
          transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
          visibility 0s 0.3s;
      }

      &.is-dragging {
        transition: none;
      }
    }

    .head {
      flex: none;
      /* The vertical drag is for the sheet, not for scrolling the page. */
      touch-action: none;
      user-select: none;
    }

    .toggle {
      position: relative;
      display: block;
      width: 100%;
      padding: var(--space-5) var(--space-4) var(--space-2);
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .grip {
      position: absolute;
      top: var(--space-2);
      left: 50%;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--line-strong);
      transform: translateX(-50%);
    }

    .peek {
      padding: 0 var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    }

    .is-expanded .peek {
      display: none;
    }

    .body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      border-top: 1px solid var(--line);
    }

    .body[inert] {
      visibility: hidden;
    }

    @media (prefers-reduced-motion: reduce) {
      .sheet,
      .backdrop {
        transition: none;
      }
    }
  `,
  template: `
    <div
      class="backdrop"
      aria-hidden="true"
      [class.dim]="state() === 'expanded'"
      [class.off]="state() === 'closed'"
      (click)="close()"
    ></div>
    <div
      #sheet
      class="sheet"
      role="dialog"
      tabindex="-1"
      [attr.aria-modal]="state() === 'closed' ? null : 'true'"
      [attr.aria-label]="label()"
      [attr.inert]="state() === 'closed' ? '' : null"
      [class.is-closed]="state() === 'closed'"
      [class.is-expanded]="state() === 'expanded'"
      [class.is-dragging]="dragging()"
      [style.--sheet-drag]="dragOffset() + 'px'"
      [style.--sheet-peek]="peekHeight() + 'px'"
      (keydown.escape)="close()"
    >
      <div #head class="head" (pointerdown)="onDown($event)" (dragstart)="$event.preventDefault()">
        <button
          #toggle
          type="button"
          class="toggle"
          [attr.aria-controls]="bodyId"
          [attr.aria-expanded]="state() === 'expanded'"
          (click)="onToggleClick()"
        >
          <span class="grip" aria-hidden="true"></span>
          <ng-content select="[sheetHeader]" />
        </button>
        <div class="peek">
          <ng-content select="[sheetPeek]" />
        </div>
      </div>
      <div class="body" [id]="bodyId" [attr.inert]="state() === 'expanded' ? null : ''">
        <ng-content />
      </div>
    </div>
  `,
})
export class BottomSheet {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = model<SheetState>('closed');
  /** Name of the dialog, for assistive technology. */
  readonly label = input.required<string>();
  /** With `false` there is no peek: the sheet is either expanded or closed. */
  readonly collapsible = input(true);

  protected readonly bodyId = `sheet-body-${nextId++}`;
  protected readonly dragOffset = signal(0);
  protected readonly dragging = signal(false);
  protected readonly peekHeight = signal(PEEK_FALLBACK);

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private readonly head = viewChild.required<ElementRef<HTMLElement>>('head');
  private readonly toggle = viewChild.required<ElementRef<HTMLElement>>('toggle');
  private gesture: { y: number; from: SheetState } | null = null;
  private swallowClick = false;
  /** What had the focus when it opened, to give it back when it closes. */
  private opener: HTMLElement | null = null;
  private previous: SheetState = 'closed';

  constructor() {
    // Focus goes into the sheet when it opens and back to what opened it when it closes.
    effect(() => {
      const state = this.state();
      untracked(() => this.onStateChange(state));
    });
    this.destroyRef.onDestroy(() => this.stopListening());
    // The peek height is that of the head (grip, header, summary and actions).
    afterNextRender(() => {
      const head = this.head().nativeElement;
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(head);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected close(): void {
    if (this.state() !== 'closed') this.state.set('closed');
  }

  protected onToggleClick(): void {
    // A drag ends with a click on the same button: it has already been handled.
    if (this.swallowClick) return;
    const state = this.state();
    if (!this.collapsible()) this.state.set('closed');
    else this.state.set(state === 'expanded' ? 'peek' : 'expanded');
  }

  private onStateChange(state: SheetState): void {
    const before = this.previous;
    this.previous = state;
    if (state === 'closed') {
      const opener = this.opener;
      this.opener = null;
      if (before !== 'closed' && opener?.isConnected) opener.focus({ preventScroll: true });
      return;
    }
    if (before === 'closed') {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    afterNextRender(
      () => {
        this.measure();
        // Peek: on the head; expanded: on the sheet itself, so a phone keyboard does not pop up.
        if (this.state() === 'peek') this.toggle().nativeElement.focus({ preventScroll: true });
        else if (before === 'closed') this.sheet().nativeElement.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  private measure(): void {
    if (this.state() !== 'peek') return;
    const height = this.head().nativeElement.offsetHeight;
    if (height > 0) this.peekHeight.set(height);
  }

  // Dragging

  /** Distance from the sheet's top position (expanded) to where it rests in `state`. */
  private restingY(state: SheetState): number {
    const height = this.sheet().nativeElement.offsetHeight;
    if (state === 'expanded') return 0;
    return state === 'peek' ? Math.max(0, height - this.peekHeight()) : height;
  }

  protected onDown(event: PointerEvent): void {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (this.state() === 'closed') return;
    if ((event.target as Element).closest(OWN_CONTROLS)) return;
    this.gesture = { y: event.clientY, from: this.state() };
    // The page follows the pointer, not the head: a mouse leaves it as soon as it moves.
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
  }

  private stopListening(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
  }

  private readonly onMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture) return;
    const delta = event.clientY - gesture.y;
    if (!this.dragging()) {
      if (Math.abs(delta) < DRAG_SLOP) return;
      this.dragging.set(true);
    }
    // It can only travel between fully open and fully out of sight.
    const rest = this.restingY(gesture.from);
    const closed = this.restingY('closed');
    this.dragOffset.set(clamp(delta, -rest, closed - rest));
  };

  private readonly onUp = (): void => {
    const gesture = this.gesture;
    this.gesture = null;
    this.stopListening();
    if (!gesture || !this.dragging()) return;
    const offset = this.dragOffset();
    const rest = this.restingY(gesture.from);
    const reach = Math.abs(this.restingY('peek') - this.restingY('expanded'));
    let target = gesture.from;
    if (Math.abs(offset) > Math.min(DRAG_COMMIT, reach / 3)) {
      // The resting place in the direction of the drag that is nearest to where it was let go.
      const candidates = (['expanded', 'peek', 'closed'] as const).filter(
        (state) =>
          (state !== 'peek' || this.collapsible()) &&
          (offset > 0 ? this.restingY(state) > rest : this.restingY(state) < rest),
      );
      const y = rest + offset;
      target = candidates.reduce<SheetState>(
        (best, state) =>
          best === gesture.from ||
          Math.abs(this.restingY(state) - y) < Math.abs(this.restingY(best) - y)
            ? state
            : best,
        gesture.from,
      );
    }
    this.endDrag();
    if (target !== gesture.from) this.state.set(target);
  };

  private readonly onCancel = (): void => {
    this.gesture = null;
    this.stopListening();
    this.endDrag();
  };

  private endDrag(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    this.dragOffset.set(0);
    // The click that follows the release comes before any timer.
    this.swallowClick = true;
    setTimeout(() => (this.swallowClick = false));
  }
}
