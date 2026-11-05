import type { BoardColumn, Item, MoveItem } from '@rayrecords/shared';

/** Same rule as `FIELD_KEY_RE` in shared (copied here to keep Zod out of the web bundle). */
const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/;

/**
 * Pure board logic: where a card ends up when dropped or moved, and how the move is mirrored locally
 * while the API responds. No Angular or DOM, so it is tested without mounting anything.
 */

/** Cards of a column, in the order they arrive (the API already sorts them). */
export function itemsInColumn(items: readonly Item[], column: string): Item[] {
  return items.filter((item) => item.column === column);
}

/**
 * Move request for a card dropped in `column` at position `index`, counted among the cards of that
 * column WITHOUT the moving one (this is the drag's `currentIndex`).
 * `afterId` is the card right above it; `null` if it becomes the first.
 */
export function dropRequest(
  items: readonly Item[],
  id: string,
  column: string,
  index: number,
): MoveItem {
  const target = itemsInColumn(items, column).filter((item) => item.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  return { afterId: at === 0 ? null : target[at - 1]!.id, column };
}

/** Moves a card up (-1) or down (+1) inside its column; `null` if already at the end. */
export function stepRequest(
  items: readonly Item[],
  id: string,
  direction: -1 | 1,
): MoveItem | null {
  const item = items.find((i) => i.id === id);
  if (!item?.column) return null;
  const group = itemsInColumn(items, item.column);
  const index = group.findIndex((i) => i.id === id);
  if (direction === -1) {
    if (index <= 0) return null;
    // Up: it goes after the card two places before (or becomes first).
    return { afterId: group[index - 2]?.id ?? null, column: item.column };
  }
  const next = group[index + 1];
  return next ? { afterId: next.id, column: item.column } : null;
}

/** Moves a card to the previous (-1) or next (+1) column, at the end of it; `null` if none. */
export function shiftRequest(
  items: readonly Item[],
  columns: readonly BoardColumn[],
  id: string,
  direction: -1 | 1,
): MoveItem | null {
  const item = items.find((i) => i.id === id);
  if (!item?.column) return null;
  const from = columns.findIndex((c) => c.key === item.column);
  const target = columns[from + direction];
  if (from === -1 || !target) return null;
  const last = itemsInColumn(items, target.key).at(-1);
  return { afterId: last?.id ?? null, column: target.key };
}

/** Moves a card to another column (at the end), e.g. from the «Mover a…» menu; `null` if already there. */
export function moveToRequest(items: readonly Item[], id: string, column: string): MoveItem | null {
  const item = items.find((i) => i.id === id);
  if (!item || item.column === column) return null;
  return dropRequest(items, id, column, Number.MAX_SAFE_INTEGER);
}

/** Mirrors a move in the local list so the card does not jump while the API responds. */
export function applyMove(
  items: readonly Item[],
  id: string,
  column: string,
  afterId: string | null,
): Item[] {
  const moved = items.find((i) => i.id === id);
  if (!moved) return [...items];
  const rest = items.filter((i) => i.id !== id);
  let at: number;
  if (afterId === null) {
    const first = rest.findIndex((i) => i.column === column);
    at = first === -1 ? rest.length : first;
  } else {
    const index = rest.findIndex((i) => i.id === afterId);
    at = index === -1 ? rest.length : index + 1;
  }
  return [...rest.slice(0, at), { ...moved, column }, ...rest.slice(at)];
}

/** Neighbouring card for J/K traversal: columns left to right, top to bottom within each. */
export function neighbourId(
  items: readonly Item[],
  columns: readonly BoardColumn[],
  id: string | null,
  step: -1 | 1,
): string | null {
  const flat = columns.flatMap((c) => itemsInColumn(items, c.key));
  if (flat.length === 0) return null;
  const index = flat.findIndex((i) => i.id === id);
  if (index === -1) return flat[step === 1 ? 0 : flat.length - 1]!.id;
  return flat[index + step]?.id ?? null;
}

/** Column key from its name («Por hacer» → `porHacer`), different from the existing ones. */
export function columnKey(label: string, existing: readonly string[]): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  if (!/^[a-z]/.test(base)) base = `col${base}`;
  base = base.slice(0, 36);
  let key = base;
  for (let n = 2; existing.includes(key); n++) key = `${base}${n}`;
  return FIELD_KEY.test(key) ? key : `col${existing.length + 1}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-11-12` (or an ISO instant) → «12 nov»; independent of the time zone. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day || month > 12) return iso;
  return `${day} ${MONTHS[month - 1]}`;
}

/** Today as `YYYY-MM-DD` in the user's time zone. */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `true` if the due date has passed (`YYYY-MM-DD`, comparable as text). */
export function isOverdue(dueDate: string | undefined, today: string): boolean {
  return !!dueDate && dueDate < today;
}

/** «7 tarjetas · 2 hechas» / «5 elementos · 1 hecho», with plurals resolved. */
export function summaryText(items: readonly Item[], kind: 'card' | 'item'): string {
  const total = items.length;
  const done = items.filter((i) => i.doneAt).length;
  const noun = kind === 'card' ? ['tarjeta', 'tarjetas'] : ['elemento', 'elementos'];
  const doneNoun = kind === 'card' ? ['hecha', 'hechas'] : ['hecho', 'hechos'];
  const label = `${total} ${noun[total === 1 ? 0 : 1]}`;
  return done === 0 ? label : `${label} · ${done} ${doneNoun[done === 1 ? 0 : 1]}`;
}

/** Tones of the categorical palette (`.hue-*` in styles/_components.scss). */
export type Hue = 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'teal';

const HUES: readonly Hue[] = ['blue', 'green', 'amber', 'rose', 'violet', 'teal'];

/** Colour of a board column: by name when recognisable, otherwise by position. */
export function columnHue(label: string, index: number): Hue {
  const name = label.trim().toLowerCase();
  if (/(hech|termin|complet|done|cerrad|finaliz)/.test(name)) return 'green';
  if (/(curso|progres|doing|revis|test)/.test(name)) return 'amber';
  if (/(por hacer|pendient|todo|backlog|idea|nuev)/.test(name)) return 'blue';
  // Skip blue, green and amber, used by the recognisable names, so their meaning is not repeated.
  const rest: readonly Hue[] = ['violet', 'teal', 'rose'];
  return rest[index % rest.length]!;
}

const KNOWN_TAG_HUES: Readonly<Record<string, Hue>> = {
  urgente: 'rose',
  alta: 'rose',
  media: 'amber',
  baja: 'green',
  bug: 'rose',
  error: 'rose',
  mejora: 'blue',
  idea: 'violet',
  trabajo: 'blue',
  casa: 'amber',
  personal: 'teal',
};

/** Colour of a label: fixed for the usual ones (priority, type) and stable per text for the rest. */
export function tagHue(tag: string): Hue {
  const key = tag.trim().toLowerCase();
  const known = KNOWN_TAG_HUES[key];
  if (known) return known;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length]!;
}
