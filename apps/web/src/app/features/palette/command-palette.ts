import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { canUseGlobalShortcut, goShortcutTarget } from '../../core/palette/go-shortcuts';
import { PaletteService } from '../../core/palette/palette.service';
import { PaletteDialog } from './palette-dialog';

/**
 * Parte de la paleta de comandos que vive siempre en el shell: los atajos globales de una tecla
 * (Mayús+N · L · C · G · U para ir a una sección y «/» para escribir una nota o tarea) y el hueco
 * donde se monta la paleta. El cuerpo (`PaletteDialog`, con sus estilos, su búsqueda y el modo de
 * captura) no entra en el bundle inicial: se precarga cuando el navegador está ocioso y se pinta al
 * abrirla con Ctrl+K, con «/» o con el botón de la barra.
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
   * Con Ctrl/Alt/Meta, un modal, un desplegable o un campo con el foco no se hace nada: son atajos de
   * una sola tecla y ahí la tecla es para escribir. Con la paleta abierta tampoco (es un modal).
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.repeat) return;
    if (this.palette.isOpen() || !canUseGlobalShortcut(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // «/» (en el teclado español es Mayús+7, por eso no se mira Mayús) abre la paleta ya en el modo de escribir.
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
