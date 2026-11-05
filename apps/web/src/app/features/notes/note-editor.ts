import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** The on-screen keyboard appears late and shrinks the viewport: wait before repositioning. */
const KEYBOARD_DELAY_MS = 300;

/**
 * On appearing, the field takes focus with the cursor at the end of the text and makes sure it is
 * fully visible (with its buttons) even when the mobile keyboard shows.
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
