import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { canUseGlobalShortcut, goShortcutTarget } from '../../core/palette/go-shortcuts';
import { PaletteService } from '../../core/palette/palette.service';
import { PaletteDialog } from './palette-dialog';

/**
 * The part of the command palette that always lives in the shell: the single-key global shortcuts
 * (Shift+N, L, C, G, U to go to a section and "/" to write a note or task) and the slot where the
 * palette is mounted. The body (`PaletteDialog`, with its styles, search and capture mode) is not in
 * the initial bundle: it is preloaded when the browser is idle and drawn when opened with Ctrl+K,
 * with "/" or with the bar button.
 */
@Component({
  selector: 'app-command-palette',
  imports: [PaletteDialog],
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    @defer (when palette.isOpen(); prefetch on idle) {
      <app-palette-dialog />
    }
  `,
})
export class CommandPalette {
  protected readonly palette = inject(PaletteService);
  private readonly router = inject(Router);

  /**
   * With Ctrl/Alt/Meta, a modal, an overlay or a focused field nothing happens: these are single-key
   * shortcuts and there the key is for typing. With the palette open neither (it is a modal).
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.repeat) return;
    if (this.palette.isOpen() || !canUseGlobalShortcut(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // "/" (Shift+7 on the Spanish keyboard, so Shift is not checked) opens the palette already in write mode.
    if (event.key === '/') {
      event.preventDefault();
      this.palette.show({ capture: true });
      return;
    }

    const url = goShortcutTarget(event);
    if (url) {
      event.preventDefault();
      void this.router.navigateByUrl(url);
    }
  }
}
