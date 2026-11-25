import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * A button that opens a small floating menu under it (above it when there is no room). Project
 * what the button shows with `trigger` and the menu content with `panel`; an element of the menu
 * with a `data-pick` attribute closes it when pressed. The menu is moved to the end of the page
 * so no container (a panel, a dialog) can clip or cover it. Esc, a click outside or a pick closes it.
 */
@Component({
  selector: 'app-dropdown',
  host: {
    '(keydown.escape)': 'escape($event)',
  },
  styles: `
    :host {
      display: inline-flex;
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--control-height);
      max-width: 100%;
      padding: 0 var(--space-3);
      justify-content: center;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;

      /* No border: the button reads as the property itself, with a clear hover. */
      &:hover,
      &[aria-expanded='true'] {
        background: var(--row-hover);
      }

      &.compact {
        padding: 0 var(--space-2);
      }
    }

    .panel {
      position: fixed;
      z-index: calc(var(--z-drag) + 1);
      box-sizing: border-box;
      min-width: 200px;
      max-width: calc(100vw - 16px);
      max-height: min(60vh, 420px);
      padding: var(--space-1);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-lg);
    }

    @media (width <= 767px) {
      .trigger {
        min-height: var(--touch-target);
      }
    }
  `,
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [class.compact]="compact()"
      aria-haspopup="true"
      [attr.aria-label]="label() || null"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <ng-content select="[trigger]" />
    </button>
    @if (open()) {
      <div
        #panel
        class="panel"
        [style.top.px]="position().top"
        [style.bottom.px]="position().bottom"
        [style.left.px]="position().left"
        (click)="picked($event)"
      >
        <ng-content select="[panel]" />
      </div>
    }
  `,
})
export class Dropdown {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Accessible name of the button (when what it shows is only an icon). */
  readonly label = input('');
  /** Less padding, for a button that only holds an icon or a swatch. */
  readonly compact = input(false);

  /** Emitted when the menu opens (its content may want to read something first). */
  readonly opened = output<void>();

  protected readonly open = signal(false);
  protected readonly position = signal<{ top: number | null; bottom: number | null; left: number }>(
    {
      top: 0,
      bottom: null,
      left: 0,
    },
  );

  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // The menu lives at the end of the body, out of the way of any clipping container.
    effect(() => {
      const panel = this.panel()?.nativeElement;
      if (panel && panel.parentElement !== document.body) document.body.append(panel);
    });
    // The page is listened to only while the menu is open.
    effect((onCleanup) => {
      if (!this.open()) return;
      const close = () => this.close();
      const escape = (event: KeyboardEvent) => event.key === 'Escape' && close();
      document.addEventListener('pointerdown', this.outside);
      document.addEventListener('keydown', escape);
      window.addEventListener('resize', close);
      onCleanup(() => {
        document.removeEventListener('pointerdown', this.outside);
        document.removeEventListener('keydown', escape);
        window.removeEventListener('resize', close);
      });
    });
    // Angular removes the host, not a panel that was moved out of it.
    inject(DestroyRef).onDestroy(() => this.panel()?.nativeElement.remove());
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    const rect = this.trigger()!.nativeElement.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 216));
    this.position.set(
      below < 260 && rect.top > below
        ? { top: null, bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, bottom: null, left },
    );
    this.open.set(true);
    this.opened.emit();
  }

  close(): void {
    this.open.set(false);
  }

  protected escape(event: Event): void {
    if (!this.open()) return;
    // The menu closes and the key goes no further (a side panel around it would close too).
    event.stopPropagation();
    this.close();
  }

  private readonly outside = (event: Event): void => {
    const target = event.target as Node;
    if (this.host.nativeElement.contains(target) || this.panel()?.nativeElement.contains(target)) {
      return;
    }
    this.close();
  };

  protected picked(event: Event): void {
    if ((event.target as HTMLElement).closest('[data-pick]')) this.close();
  }
}
