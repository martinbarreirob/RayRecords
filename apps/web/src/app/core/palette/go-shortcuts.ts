/**
 * Atajos globales «Ir a»: Mayús+N · Mayús+L · Mayús+C · Mayús+G · Mayús+U. Vive aparte de la paleta
 * porque lo usa el shell (siempre cargado), mientras que la paleta en sí se descarga al abrirla por
 * primera vez.
 */

export const GO_TARGETS = {
  n: { url: '/notas', label: 'Notas', keywords: 'tablero lienzo apuntes' },
  l: { url: '/listas', label: 'Listas', keywords: 'kanban tableros' },
  c: { url: '/calendario', label: 'Calendario', keywords: 'agenda fechas mes' },
  g: { url: '/gastos', label: 'Gastos', keywords: 'dinero movimientos extractos categorias' },
} as const;

export type GoKey = keyof typeof GO_TARGETS;

/** Orden de las secciones: el de la barra superior. Alt+→ avanza y Alt+← retrocede por esta lista. */
export const SECTION_ORDER = ['/notas', '/listas', '/calendario', '/gastos'] as const;

/**
 * Sección vecina de la que contiene `url` (`/listas/compras` cuenta como `/listas`), o `null` si la
 * dirección no es de una sección (login, raíz) o ya está en el extremo: no da la vuelta, así que el
 * mismo atajo siempre va en el mismo sentido.
 */
export function adjacentSection(url: string, direction: 1 | -1): string | null {
  const first = url.split(/[?#]/)[0]?.split('/')[1] ?? '';
  const index = SECTION_ORDER.findIndex((section) => section === `/${first}`);
  if (index < 0) return null;
  return SECTION_ORDER[index + direction] ?? null;
}

/** Cómo se enseña el atajo de una sección: «⇧N». */
export function shortcutLabel(key: GoKey): string {
  return `⇧${key.toUpperCase()}`;
}

/** Lo mínimo de un `KeyboardEvent` que miran los atajos globales (así se prueban sin eventos reales). */
export interface ShortcutKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Dirección a la que lleva el atajo «Mayús + letra», o `null` si la pulsación no es uno. Exige Mayús
 * y rechaza Ctrl, Alt y Meta (Ctrl+Mayús+N, por ejemplo, es del navegador).
 */
export function goShortcutTarget(event: ShortcutKeyEvent): string | null {
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.key.length !== 1) return null;
  const key = event.key.toLowerCase();
  return key in GO_TARGETS ? GO_TARGETS[key as GoKey].url : null;
}

/**
 * Controles en los que se teclea o se elige con letras: campos, áreas de texto, contenido editable y
 * los selectores de PrimeNG (que buscan por la primera letra). Los atajos globales de una sola tecla
 * no deben activarse con el foco en alguno de ellos.
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

/** Paneles desplegables de PrimeNG (selector, multiselector y calendario) abiertos en la página. */
const OPEN_OVERLAY_SELECTOR = '.p-select-overlay, .p-multiselect-overlay, .p-datepicker-panel';

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest(TYPING_SELECTOR) !== null)
  );
}

/**
 * ¿Se pueden usar ahora los atajos globales de una sola tecla (Mayús+letra, «/»)? No si el foco está
 * en un control de escritura, si hay un modal (`aria-modal`, como los diálogos de PrimeNG y la propia
 * paleta) o un desplegable abierto, ni si otro código ya atendió la tecla.
 */
export function canUseGlobalShortcut(event: Event): boolean {
  return (
    !event.defaultPrevented &&
    !isTypingTarget(event.target) &&
    document.querySelector(`[aria-modal="true"], ${OPEN_OVERLAY_SELECTOR}`) === null
  );
}
