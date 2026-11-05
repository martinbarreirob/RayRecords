/**
 * Constantes del lienzo de notas, sin ninguna dependencia. Viven aparte de los esquemas Zod para que
 * la web pueda usarlas sin arrastrar Zod al bundle (el paquete es `sideEffects: false`).
 */

/** Una tarjeta hecha deja de mostrarse pasadas 24 h desde `doneAt`. */
export const DONE_VISIBLE_MS = 24 * 60 * 60 * 1000;

export const NOTE_COORD_MAX = 10_000;
export const NOTE_CARD_WIDTH = 280;
export const NOTE_GROUP_WIDTH = 420;
export const NOTE_GROUP_HEIGHT = 300;
