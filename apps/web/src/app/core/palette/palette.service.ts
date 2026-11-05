import { Injectable, signal } from '@angular/core';

/**
 * Command palette state (Ctrl+K). The component that renders it reads it; the shell opens it.
 * It remembers what had focus on open so it can give it back on close.
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  readonly isOpen = signal(false);
  /**
   * Id of the card just created by "Nueva nota". The notes screen can read it to focus the card
   * and must reset it to `null` once consumed (navigating to the same URL carries no state).
   */
  readonly newNoteId = signal<string | null>(null);
  /**
   * Opened with "/": the palette goes straight into the "write a note or task" mode. The palette
   * consumes it (`takeCaptureRequest`) when it mounts, so it only applies to that opening.
   */
  private captureRequested = false;
  private opener: HTMLElement | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opens the palette; with `capture`, already in the write-a-note-or-task mode. */
  show(options: { capture?: boolean } = {}): void {
    if (this.isOpen()) return;
    this.captureRequested = options.capture === true;
    if (this.restoreTimer !== undefined) {
      // Reopened before the previous close gave focus back: cancel that (it must not steal focus
      // from the new palette field) and keep whoever really had it.
      clearTimeout(this.restoreTimer);
      this.restoreTimer = undefined;
    } else {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    this.isOpen.set(true);
  }

  /** Was capture mode requested? Returns the request and clears it. */
  takeCaptureRequest(): boolean {
    const requested = this.captureRequested;
    this.captureRequested = false;
    return requested;
  }

  /** Closes the palette. With `restoreFocus: false` (e.g. when navigating away) it leaves focus alone. */
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

  toggle(): void {
    if (this.isOpen()) this.hide();
    else this.show();
  }
}
