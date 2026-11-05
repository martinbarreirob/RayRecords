/**
 * Global "go to" shortcuts: Shift+N, L, C, G, U. Kept apart from the palette because the shell
 * (always loaded) uses them, while the palette itself is downloaded the first time it opens.
 */

export const GO_TARGETS = {
  n: { url: '/notas', label: 'Notas', keywords: 'tablero lienzo apuntes' },
  l: { url: '/listas', label: 'Listas', keywords: 'kanban tableros' },
  c: { url: '/calendario', label: 'Calendario', keywords: 'agenda fechas mes' },
  g: { url: '/gastos', label: 'Gastos', keywords: 'dinero movimientos extractos categorias' },
} as const;

export type GoKey = keyof typeof GO_TARGETS;

/** Section order, same as the top bar. Alt+Right moves forward and Alt+Left back through this list. */
export const SECTION_ORDER = ['/notas', '/listas', '/calendario', '/gastos'] as const;

/**
 * Neighbor section of the one containing `url` (`/listas/compras` counts as `/listas`), or `null`
 * if the address is not a section (login, root) or is already at the end. It does not wrap around,
 * so the same shortcut always goes the same way.
 */
export function adjacentSection(url: string, direction: 1 | -1): string | null {
  const first = url.split(/[?#]/)[0]?.split('/')[1] ?? '';
  const index = SECTION_ORDER.findIndex((section) => section === `/${first}`);
  if (index < 0) return null;
  return SECTION_ORDER[index + direction] ?? null;
}

/** How a section shortcut is shown: "⇧N". */
export function shortcutLabel(key: GoKey): string {
  return `⇧${key.toUpperCase()}`;
}

/** The minimum of a `KeyboardEvent` the global shortcuts look at (so they can be tested without real events). */
export interface ShortcutKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Destination of a "Shift + letter" shortcut, or `null` if the key press is not one. Requires Shift
 * and rejects Ctrl, Alt and Meta (Ctrl+Shift+N, for example, belongs to the browser).
 */
export function goShortcutTarget(event: ShortcutKeyEvent): string | null {
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.key.length !== 1) return null;
  const key = event.key.toLowerCase();
  return key in GO_TARGETS ? GO_TARGETS[key as GoKey].url : null;
}

/**
 * Controls where the user types or picks with letters: inputs, textareas, editable content and the
 * PrimeNG selects (which search by first letter). Single-key global shortcuts must not fire while
 * one of them has focus.
 */
const TYPING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '.p-select',
  '.p-multiselect',
  '.p-datepicker',
  '.p-inputnumber',
].join(',');

/** Open PrimeNG overlay panels (select, multiselect and calendar) on the page. */
const OPEN_OVERLAY_SELECTOR = '.p-select-overlay, .p-multiselect-overlay, .p-datepicker-panel';

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest(TYPING_SELECTOR) !== null)
  );
}

/**
 * Can the single-key global shortcuts (Shift+letter, "/") be used now? Not if focus is in a typing
 * control, if a modal is open (`aria-modal`, like the PrimeNG dialogs and the palette itself) or an
 * overlay is open, or if other code already handled the key.
 */
export function canUseGlobalShortcut(event: Event): boolean {
  return (
    !event.defaultPrevented &&
    !isTypingTarget(event.target) &&
    document.querySelector(`[aria-modal="true"], ${OPEN_OVERLAY_SELECTOR}`) === null
  );
}
