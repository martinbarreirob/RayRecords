/**
 * Constants of the notes canvas, with no dependencies. They live apart from the Zod schemas so the
 * web app can use them without pulling Zod into its bundle (the package is `sideEffects: false`).
 */

/** A done card stops being shown 24 h after `doneAt`. */
export const DONE_VISIBLE_MS = 24 * 60 * 60 * 1000;

export const NOTE_COORD_MAX = 10_000;
export const NOTE_CARD_WIDTH = 280;
export const NOTE_GROUP_WIDTH = 420;
export const NOTE_GROUP_HEIGHT = 300;
