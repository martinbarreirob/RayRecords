import type { BoardColumn, Item, MoveItem } from '@rayrecords/shared';

/** Misma regla que `FIELD_KEY_RE` de shared (aquí copiada para no arrastrar Zod a la web). */
const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/;

/**
 * Lógica pura del tablero: dónde queda una tarjeta al soltarla o moverla y cómo se refleja en local
 * mientras la API responde. No depende de Angular ni del DOM, así que se prueba sin montar nada.
 */

/** Tarjetas de una columna, en el orden en que llegan (la API ya las ordena). */
export function itemsInColumn(items: readonly Item[], column: string): Item[] {
  return items.filter((item) => item.column === column);
}

/**
 * Petición de movimiento para una tarjeta que se suelta en `column` en la posición `index`, contada
 * entre las tarjetas de esa columna SIN la que se mueve (es el `currentIndex` del arrastre).
 * `afterId` es la tarjeta que queda justo encima; `null` si pasa a ser la primera.
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

/** Sube (-1) o baja (+1) una tarjeta dentro de su columna; `null` si ya está en el extremo. */
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
    // Subir: queda tras la que estaba dos puestos antes (o la primera).
    return { afterId: group[index - 2]?.id ?? null, column: item.column };
  }
  const next = group[index + 1];
  return next ? { afterId: next.id, column: item.column } : null;
}

/** Pasa una tarjeta a la columna anterior (-1) o siguiente (+1), al final de ella; `null` si no hay. */
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

/** Pasa una tarjeta a otra columna (al final de ella), p. ej. desde el menú «Mover a…»; `null` si ya está ahí. */
export function moveToRequest(items: readonly Item[], id: string, column: string): MoveItem | null {
  const item = items.find((i) => i.id === id);
  if (!item || item.column === column) return null;
  return dropRequest(items, id, column, Number.MAX_SAFE_INTEGER);
}

/** Refleja un movimiento en la lista local (para que la tarjeta no «salte» mientras responde la API). */
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

/** Tarjeta vecina en el recorrido J/K: columnas de izquierda a derecha, y arriba abajo en cada una. */
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

/** Clave de columna a partir de su nombre («Por hacer» → `porHacer`), distinta de las existentes. */
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

/** `2026-11-12` (o un instante ISO) → «12 nov»; no depende de la zona horaria. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day || month > 12) return iso;
  return `${day} ${MONTHS[month - 1]}`;
}

/** Hoy como `YYYY-MM-DD` en la zona horaria del usuario. */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `true` si la fecha límite ya pasó (formato `YYYY-MM-DD`, comparable como texto). */
export function isOverdue(dueDate: string | undefined, today: string): boolean {
  return !!dueDate && dueDate < today;
}

/** «7 tarjetas · 2 hechas» / «5 elementos · 1 hecho», con los plurales resueltos. */
export function summaryText(items: readonly Item[], kind: 'card' | 'item'): string {
  const total = items.length;
  const done = items.filter((i) => i.doneAt).length;
  const noun = kind === 'card' ? ['tarjeta', 'tarjetas'] : ['elemento', 'elementos'];
  const doneNoun = kind === 'card' ? ['hecha', 'hechas'] : ['hecho', 'hechos'];
  const label = `${total} ${noun[total === 1 ? 0 : 1]}`;
  return done === 0 ? label : `${label} · ${done} ${doneNoun[done === 1 ? 0 : 1]}`;
}

/** Tonos de la paleta categórica (`.hue-*` en styles/_components.scss). */
export type Hue = 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'teal';

const HUES: readonly Hue[] = ['blue', 'green', 'amber', 'rose', 'violet', 'teal'];

/** Color de una columna del tablero. Por el nombre cuando es reconocible; si no, por su posición. */
export function columnHue(label: string, index: number): Hue {
  const name = label.trim().toLowerCase();
  if (/(hech|termin|complet|done|cerrad|finaliz)/.test(name)) return 'green';
  if (/(curso|progres|doing|revis|test)/.test(name)) return 'amber';
  if (/(por hacer|pendient|todo|backlog|idea|nuev)/.test(name)) return 'blue';
  // Se saltan el azul, el verde y el ámbar de los nombres reconocibles para no repetir su significado.
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

/** Color de una etiqueta: fijo para las habituales (prioridad, tipo) y estable por texto para el resto. */
export function tagHue(tag: string): Hue {
  const key = tag.trim().toLowerCase();
  const known = KNOWN_TAG_HUES[key];
  if (known) return known;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length]!;
}
