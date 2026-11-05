import { Injectable, signal } from '@angular/core';

/**
 * Estado de la paleta de comandos (Ctrl+K). El componente que la pinta lo lee; el shell la abre.
 * Recuerda qué tenía el foco al abrirla para devolvérselo al cerrar.
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  readonly isOpen = signal(false);
  /**
   * Id de la tarjeta que acaba de crear «Nueva nota». La pantalla de notas puede leerlo para
   * enfocarla y debe devolverlo a `null` al consumirlo (navegar a la misma URL no lleva estado).
   */
  readonly newNoteId = signal<string | null>(null);
  /**
   * Se abrió con «/»: la paleta entra directamente en el modo «escribir una nota o tarea». La paleta
   * lo consume (`takeCaptureRequest`) al montarse, así que solo vale para esa apertura.
   */
  private captureRequested = false;
  private opener: HTMLElement | null = null;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  /** Abre la paleta; con `capture`, ya en el modo de escribir una nota o tarea. */
  show(options: { capture?: boolean } = {}): void {
    if (this.isOpen()) return;
    this.captureRequested = options.capture === true;
    if (this.restoreTimer !== undefined) {
      // Se reabre antes de devolver el foco del cierre anterior: se cancela (no debe robárselo al
      // campo de la paleta nueva) y se conserva quien lo tenía de verdad.
      clearTimeout(this.restoreTimer);
      this.restoreTimer = undefined;
    } else {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    this.isOpen.set(true);
  }

  /** ¿Se pidió abrir en modo captura? Devuelve la petición y la borra. */
  takeCaptureRequest(): boolean {
    const requested = this.captureRequested;
    this.captureRequested = false;
    return requested;
  }

  /** Cierra la paleta. Con `restoreFocus: false` (p. ej. al navegar a otra pantalla) no toca el foco. */
  hide(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    const opener = this.opener;
    if (restoreFocus && opener) {
      // Tras el siguiente pintado, cuando la capa ya no está en el DOM.
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
