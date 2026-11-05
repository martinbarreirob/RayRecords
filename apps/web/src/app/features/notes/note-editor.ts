import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Con el teclado en pantalla tarda en aparecer y reduce la altura visible: se espera antes de recolocar. */
const KEYBOARD_DELAY_MS = 300;

/**
 * Al aparecer, el campo toma el foco con el cursor al final del texto y se asegura de que se vea
 * entero (con sus botones) aunque salga el teclado del móvil.
 */
@Directive({ selector: 'textarea[appNoteEditor]' })
export class NoteEditor {
  constructor() {
    const el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      const reveal = () => (el.parentElement ?? el).scrollIntoView?.({ block: 'nearest' });
      reveal();
      const timer = setTimeout(() => el.isConnected && reveal(), KEYBOARD_DELAY_MS);
      el.addEventListener('blur', () => clearTimeout(timer), { once: true });
    });
  }
}
