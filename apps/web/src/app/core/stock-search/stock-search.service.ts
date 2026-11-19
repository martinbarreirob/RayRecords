import { Injectable, signal } from '@angular/core';

/**
 * State of the stock search dialog (the one "Nueva venta" opens). The shell mounts the dialog and
 * reads it from here; any screen can open it. It remembers what had focus so it can give it back.
 */
@Injectable({ providedIn: 'root' })
export class StockSearchService {
  readonly isOpen = signal(false);
  private opener: HTMLElement | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  show(): void {
    if (this.isOpen()) return;
    if (this.restoreTimer !== undefined) {
      // Reopened before the previous close gave focus back: cancel that (it must not steal focus
      // from the new search field) and keep whoever really had it.
      clearTimeout(this.restoreTimer);
      this.restoreTimer = undefined;
    } else {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    this.isOpen.set(true);
  }

  /** Closes it. With `restoreFocus: false` (when navigating away) focus is left alone. */
  hide(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    const opener = this.opener;
    if (restoreFocus && opener) {
      // After the next paint, once the layer is no longer in the DOM.
      this.restoreTimer = setTimeout(() => {
        this.restoreTimer = undefined;
        this.opener = null;
        if (opener.isConnected) opener.focus();
      });
    } else {
      this.opener = null;
    }
  }
}
