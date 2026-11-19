/**
 * The header never scrolls: the screens scroll inside the shell's `<main>`, not the window, so
 * `window.scrollY` is always 0. Code that needs to know how far the page has scrolled asks here.
 */
export const PAGE_SCROLLER_ID = 'app-content';

export function pageScrollTop(): number {
  return document.getElementById(PAGE_SCROLLER_ID)?.scrollTop ?? 0;
}
