import { Component, HostListener, inject, input, output } from '@angular/core';
import { PaletteService } from '../palette/palette.service';

/**
 * The "add something" button of a screen. All of them look the same and show Alt+N (Option+N on
 * a Mac). Ctrl+N is also accepted, but a browser tab opens a new window with it and the page
 * never sees it (Ctrl+N, T and W are reserved; Ctrl+K is not, which is why that one can be
 * taken over). The key is matched by its physical position (`code`), because Option+N on a Mac
 * types a dead-key character.
 *
 * With `iconOnMobile` the phone shows just a plus sign, for headers with little room.
 */
@Component({
  selector: 'app-add-button',
  styles: `
    .kbd {
      border-color: color-mix(in srgb, var(--on-accent) 40%, transparent);
      background: transparent;
      color: inherit;
    }

    .plus {
      display: none;
    }

    /* On a touch screen there is no keyboard to press it with. */
    @media (width <= 767px) {
      .kbd {
        display: none;
      }

      .btn {
        min-height: var(--touch-target);
      }

      .icon-only {
        width: var(--touch-target);
        padding: 0;
      }

      .icon-only .plus {
        display: inline;
      }

      .icon-only .text {
        display: none;
      }
    }
  `,
  template: `
    <button
      type="button"
      class="btn primary"
      [class.icon-only]="iconOnMobile()"
      [attr.aria-label]="iconOnMobile() ? label() : null"
      aria-keyshortcuts="Control+N Alt+N"
      (click)="pressed.emit()"
    >
      <i class="pi pi-plus plus" aria-hidden="true"></i>
      <span class="text">{{ label() }}</span>
      &ngsp;
      <span class="kbd" aria-hidden="true">Alt N</span>
    </button>
  `,
})
export class AddButton {
  private readonly palette = inject(PaletteService);

  readonly label = input.required<string>();
  readonly iconOnMobile = input(false);
  /** Emitted by a click and by the keyboard shortcut. */
  readonly pressed = output();

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.shiftKey || event.code !== 'KeyN') return;
    // Ctrl+N (Cmd+N) is the advertised shortcut; Alt+N is the one that always reaches the page.
    const ctrl = (event.ctrlKey || event.metaKey) && !event.altKey;
    const alt = event.altKey && !event.ctrlKey && !event.metaKey;
    if (!ctrl && !alt) return;
    if (this.palette.isOpen()) return;
    event.preventDefault();
    if (!event.repeat) this.pressed.emit();
  }
}
