import { DestroyRef, Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/** Scrolled distances under this many pixels count as being at the edge. */
const EDGE = 2;

/**
 * Fades the top and bottom edges of a scrolling box while there is more content that way, so
 * rows are not cut clean by the edge. At the start only the bottom fades, at the end only the
 * top, and a box that does not scroll has no fade at all. The look is the global `.scroll-fade`
 * class; this only says which edges are on.
 */
@Directive({
  selector: '[appScrollFade]',
  host: {
    class: 'scroll-fade',
    '[class.fade-top]': 'top()',
    '[class.fade-bottom]': 'bottom()',
    '(scroll)': 'update()',
  },
})
export class ScrollFade {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly top = signal(false);
  protected readonly bottom = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.update();
      // The box or what it holds can change size without any scrolling (a filter, the window).
      if (typeof ResizeObserver !== 'undefined') {
        const resize = new ResizeObserver(() => this.update());
        resize.observe(this.element);
        destroyRef.onDestroy(() => resize.disconnect());
      }
      if (typeof MutationObserver !== 'undefined') {
        const mutation = new MutationObserver(() => this.update());
        mutation.observe(this.element, { childList: true, subtree: true });
        destroyRef.onDestroy(() => mutation.disconnect());
      }
    });
  }

  update(): void {
    const { scrollTop, scrollHeight, clientHeight } = this.element;
    this.top.set(scrollTop > EDGE);
    this.bottom.set(scrollHeight - clientHeight - scrollTop > EDGE);
  }
}
