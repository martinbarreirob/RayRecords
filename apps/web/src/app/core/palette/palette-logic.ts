import {
  DEFAULT_TIME_ZONE,
  type Item,
  type List,
  type NoteCard,
  type Product,
  type Ticket,
  type Transaction,
} from '@rayrecords/shared';
import { formatCents } from '../format';
import { MANAGEMENT_SECTIONS } from '../nav/areas';
import { GO_TARGETS, shortcutLabel, type GoKey } from './go-shortcuts';

/**
 * Pure command palette logic (no Angular): scoring matches, building and filtering results,
 * grouping them for display and moving the selection with the keyboard. The component only wires
 * it to the mouse, the keyboard and the requests.
 */

export type PaletteKind =
  'list' | 'item' | 'note' | 'expense' | 'product' | 'ticket' | 'command' | 'capture';

/** Type filter chips (Tab and Shift+Tab cycle through them). */
export type PaletteFilter = 'all' | 'lists' | 'notes' | 'expenses' | 'management' | 'commands';

export const PALETTE_FILTERS: readonly { id: PaletteFilter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'lists', label: 'Listas' },
  { id: 'notes', label: 'Notas' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'management', label: 'Gestión' },
  { id: 'commands', label: 'Comandos' },
];

/** What a result does when chosen. Just data: the component runs it. */
export type PaletteAction =
  | { type: 'go'; url: string }
  | { type: 'new-note' }
  | { type: 'start-capture' }
  | { type: 'stock-search' }
  | { type: 'toggle-theme' }
  | { type: 'logout' }
  | { type: 'capture'; text: string };

export interface PaletteResult {
  /** Unique across the palette (used as key and as the `option` id). */
  id: string;
  kind: PaletteKind;
  label: string;
  /** Secondary text next to the main one ("· 7 tarjetas", "· Reforma del baño"...). */
  hint?: string;
  /** Keyboard shortcut, one key or combination per element (`['⇧N']`, `['/']`); rendered as `.kbd`. */
  shortcut?: readonly string[];
  score: number;
  action: PaletteAction;
  /** Set on the results that belong to the management area (the "Gestión" filter keeps them). */
  area?: 'management';
}

export type PaletteGroupId = 'lists' | 'cards' | 'notes' | 'products' | 'tickets' | 'commands';

export interface PaletteRow extends PaletteResult {
  /** Position in the flat list: the one the keyboard moves. */
  index: number;
}

export interface PaletteGroup {
  id: PaletteGroupId;
  label: string;
  rows: PaletteRow[];
}

/** Maximum results per type with "Todo"; a specific filter allows more. */
const KIND_LIMIT: Record<PaletteKind, number> = {
  list: 4,
  item: 6,
  note: 5,
  expense: 5,
  product: 6,
  ticket: 4,
  command: 8,
  capture: 1,
};
const FILTERED_LIMIT = 12;

/** Lowercase and without accents, so "bano" finds "Baño". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/**
 * Score of a match of `query` in `text`: 0 if no match and, if it matches, higher the better
 * (exact text > starts with > a word starts with > appears inside). Every typed word must appear
 * in the text, in any order. An empty query scores 1.
 */
export function scoreMatch(query: string, text: string): number {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const haystack = normalize(text);
  let total = 0;
  for (const token of tokens) {
    const at = haystack.indexOf(token);
    if (at === -1) return 0;
    if (at === 0) total += 30;
    else if (!isWordChar(haystack[at - 1])) total += 20;
    else total += 10;
  }

  let score = total / tokens.length;
  const whole = tokens.join(' ');
  if (haystack === whole) score += 60;
  else if (haystack.startsWith(whole)) score += 30;
  // On equal match quality the shorter text wins (more specific).
  score += Math.max(0, 5 - haystack.length / 40);
  return score;
}

/** Best score of the query over several texts (the first weighs more than the rest). */
export function scoreAny(query: string, texts: readonly string[]): number {
  let best = 0;
  texts.forEach((text, index) => {
    const score = scoreMatch(query, text);
    if (score > 0) best = Math.max(best, index === 0 ? score : score * 0.8);
  });
  return best;
}

/** Piece of a text, marked if it is what matches the query. */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into pieces to highlight the words of `query` (ignoring accents and case, like
 * `scoreMatch`). Each word marks its first occurrence; overlaps are merged. With no query or no
 * matches it returns the whole text unmarked.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || text === '') return [{ text, match: false }];

  // Normalized character by character to know which position in the original each one maps to.
  const chars = Array.from(text);
  let folded = '';
  const starts: number[] = [];
  let offset = 0;
  for (const char of chars) {
    const piece = normalize(char);
    for (let i = 0; i < piece.length; i += 1) starts.push(offset);
    folded += piece;
    offset += char.length;
  }

  const marked: [number, number][] = [];
  for (const token of tokens) {
    const at = folded.indexOf(token);
    if (at === -1) continue;
    const from = starts[at]!;
    const lastChar = starts[at + token.length - 1]!;
    const to = lastChar + (Array.from(text.slice(lastChar))[0]?.length ?? 1);
    marked.push([from, to]);
  }
  if (marked.length === 0) return [{ text, match: false }];

  marked.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of marked) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [from, to] of merged) {
    if (from > cursor) segments.push({ text: text.slice(cursor, from), match: false });
    segments.push({ text: text.slice(from, to), match: true });
    cursor = to;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

// --- Commands -----------------------------------------------------------------------------------

export interface CommandContext {
  /** Label of the current theme ("Claro" or "Oscuro"). */
  themeLabel: string;
  username: string;
}

interface CommandDef {
  id: string;
  label: string;
  keywords: string;
  shortcut?: readonly string[];
  action: PaletteAction;
  area?: 'management';
  hint?: (context: CommandContext) => string;
}

const COMMANDS: readonly CommandDef[] = [
  {
    id: 'start-capture',
    label: 'Escribir una nota o tarea',
    keywords: 'crear apuntar anadir nueva nota tarea captura rapida lista',
    shortcut: ['/'],
    action: { type: 'start-capture' },
    hint: () => 'p. ej. compra: leche',
  },
  {
    id: 'new-note',
    label: 'Nueva tarjeta vacía',
    keywords: 'crear nota nueva apuntar tarjeta lienzo anadir en blanco',
    action: { type: 'new-note' },
    hint: () => 'en el lienzo de Notas',
  },
  ...(Object.entries(GO_TARGETS) as [GoKey, (typeof GO_TARGETS)[GoKey]][]).map(
    ([key, target]): CommandDef => ({
      id: `go-${key}`,
      label: `Ir a ${target.label}`,
      keywords: `${target.label} ${target.keywords} abrir ir`,
      shortcut: [shortcutLabel(key)],
      action: { type: 'go', url: target.url },
    }),
  ),
  // Management: its sections (the personal ones above carry their Shift shortcut) and the stock.
  ...MANAGEMENT_SECTIONS.map((section): CommandDef => ({
    id: `go-gestion-${section.url.split('/').pop()}`,
    label: `Ir a ${section.label}`,
    keywords: `gestion negocio tienda ${section.label} abrir ir`,
    hint: () => 'gestión',
    area: 'management',
    action: { type: 'go', url: section.url },
  })),
  {
    id: 'stock-search',
    label: 'Buscar en el stock',
    keywords: 'gestion producto productos inventario existencias referencia vender venta',
    action: { type: 'stock-search' },
    area: 'management',
    hint: () => 'gestión',
  },
  {
    id: 'new-product',
    label: 'Nuevo producto',
    keywords: 'gestion anadir crear producto stock inventario',
    action: { type: 'go', url: '/gestion/stock?nuevo=1' },
    area: 'management',
    hint: () => 'en el stock',
  },
  {
    id: 'toggle-theme',
    label: 'Cambiar tema',
    keywords: 'claro oscuro modo noche dark light apariencia',
    action: { type: 'toggle-theme' },
    hint: (context) => `ahora: ${context.themeLabel}`,
  },
  {
    id: 'logout',
    label: 'Cerrar sesión',
    keywords: 'salir desconectar logout',
    action: { type: 'logout' },
    hint: (context) => context.username,
  },
];

/** Commands matching the query; with no query, all of them in their natural order. */
export function searchCommands(query: string, context: CommandContext): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const command of COMMANDS) {
    const score = scoreAny(query, [command.label, command.keywords]);
    if (score === 0) continue;
    results.push({
      id: `command:${command.id}`,
      kind: 'command',
      label: command.label,
      hint: command.hint?.(context),
      shortcut: command.shortcut,
      score,
      action: command.action,
      ...(command.area ? { area: command.area } : {}),
    });
  }
  return query.trim() ? sortByScore(results) : results;
}

/** "Capturar: <text>" result, offered when nothing else matches what was typed. */
export function captureResult(text: string, hint?: string): PaletteResult {
  return {
    id: 'capture',
    kind: 'capture',
    label: `Capturar: ${text}`,
    hint,
    score: 0,
    action: { type: 'capture', text },
  };
}

// --- Data --------------------------------------------------------------------------------------

export function searchLists(query: string, lists: readonly List[]): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const list of lists) {
    if (list.archived) continue;
    const score = scoreAny(query, [list.name, list.captureAlias ?? '']);
    if (score === 0) continue;
    results.push({
      id: `list:${list.id}`,
      kind: 'list',
      label: list.name,
      hint: 'lista',
      score,
      action: { type: 'go', url: `/listas/${list.slug}` },
    });
  }
  return sortByScore(results);
}

/**
 * List cards the server returned for `query`. With `trusted` (the response is for the current
 * query) all are shown; otherwise (still typing) only the ones that still match.
 */
export function itemResults(
  query: string,
  items: readonly Item[],
  lists: readonly List[],
  trusted: boolean,
): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const item of items) {
    const list = lists.find((candidate) => candidate.id === item.listId);
    if (!list) continue;
    const matched = scoreAny(query, [item.title, ...item.tags, item.text ?? '']);
    const score = trusted ? Math.max(matched, 1) : matched;
    if (score === 0) continue;
    results.push({
      id: `item:${item.id}`,
      kind: 'item',
      label: item.title,
      hint: list.name,
      score,
      action: { type: 'go', url: `/listas/${list.slug}` },
    });
  }
  return sortByScore(results);
}

/** Line of a note to show: the first one containing the query, or the first with text. */
export function noteLine(text: string, query: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return 'Nota vacía';
  const hit = query.trim() ? lines.find((line) => scoreMatch(query, line) > 0) : undefined;
  const line = hit ?? lines[0]!;
  return line.length > 90 ? `${line.slice(0, 89).trimEnd()}…` : line;
}

export function searchNotes(query: string, cards: readonly NoteCard[]): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const card of cards) {
    const score = scoreMatch(query, card.text);
    if (score === 0) continue;
    results.push({
      id: `note:${card.id}`,
      kind: 'note',
      label: noteLine(card.text, query),
      hint: card.doneAt ? 'nota hecha' : 'nota',
      score,
      action: { type: 'go', url: '/notas' },
    });
  }
  return sortByScore(results);
}

/** "2026-11-04" to "04/11/2026". */
export function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function expenseResults(
  query: string,
  transactions: readonly Transaction[],
  trusted: boolean,
): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const transaction of transactions) {
    const matched = scoreMatch(query, transaction.description);
    const score = trusted ? Math.max(matched, 1) : matched;
    if (score === 0) continue;
    results.push({
      id: `expense:${transaction.id}`,
      kind: 'expense',
      label: transaction.description,
      hint: `${formatShortDate(transaction.date)} · ${formatCents(transaction.amountCents)}`,
      score,
      action: { type: 'go', url: '/gastos' },
    });
  }
  return sortByScore(results);
}

// --- Management ----------------------------------------------------------------------------------

/** "12,90 € · 20 uds." or "12,90 € · Agotado". */
function productHint(product: Product): string {
  const stock =
    product.quantity === 0
      ? 'Agotado'
      : `${product.quantity} ${product.quantity === 1 ? 'ud.' : 'uds.'}`;
  return `${formatCents(product.priceCents)} · ${stock}`;
}

/** Stock products matching by name, reference (sku) or notes; the stock screen shows the chosen one. */
export function searchProducts(query: string, products: readonly Product[]): PaletteResult[] {
  const results: PaletteResult[] = [];
  for (const product of products) {
    const score = scoreAny(query, [product.name, product.sku ?? '', product.notes ?? '']);
    if (score === 0) continue;
    results.push({
      id: `product:${product.id}`,
      kind: 'product',
      label: product.name,
      hint: productHint(product),
      score,
      action: { type: 'go', url: `/gestion/stock?buscar=${encodeURIComponent(product.name)}` },
      area: 'management',
    });
  }
  return sortByScore(results);
}

const DAY_IN_ZONE = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE });

/** The calendar day (`YYYY-MM-DD`) of an instant in the app's time zone, not in UTC. */
function dayInZone(iso: string): string {
  return DAY_IN_ZONE.format(new Date(iso));
}

/** "ticket 12", "tkt #12", "#12" or just "12": the ticket number typed, or `null`. */
function ticketNumber(query: string): { number: number; explicit: boolean } | null {
  const match = /^(ticket|tkt)?\s*(#)?\s*(\d{1,9})$/i.exec(query.trim());
  if (!match) return null;
  return { number: Number(match[3]), explicit: Boolean(match[1] || match[2]) };
}

/** Sales tickets whose number was typed (a bare number or "ticket 12" / "#12"). */
export function searchTickets(query: string, tickets: readonly Ticket[]): PaletteResult[] {
  const typed = ticketNumber(query);
  if (!typed) return [];
  const results: PaletteResult[] = [];
  for (const ticket of tickets) {
    if (ticket.number !== typed.number) continue;
    results.push({
      id: `ticket:${ticket.id}`,
      kind: 'ticket',
      label: `Ticket n.º ${ticket.number}`,
      hint: `${formatShortDate(dayInZone(ticket.createdAt))} · ${formatCents(ticket.totalCents)}`,
      // An explicit "ticket 12" outranks a bare number, which might be anything.
      score: typed.explicit ? 100 : 40,
      action: { type: 'go', url: `/gestion/tickets?ticket=${ticket.id}` },
      area: 'management',
    });
  }
  return results;
}

/** Sorts from highest to lowest score without changing the order of ties. */
export function sortByScore<T extends { score: number }>(results: readonly T[]): T[] {
  return results
    .map((result, position) => ({ result, position }))
    .sort((a, b) => b.result.score - a.result.score || a.position - b.position)
    .map(({ result }) => result);
}

// --- Filtering and grouping ------------------------------------------------------------------------

const FILTER_KINDS: Record<PaletteFilter, readonly PaletteKind[] | null> = {
  all: null,
  lists: ['list', 'item'],
  notes: ['note'],
  expenses: ['expense'],
  management: ['product', 'ticket'],
  commands: ['command', 'capture'],
};

export function matchesFilter(kind: PaletteKind, filter: PaletteFilter): boolean {
  const kinds = FILTER_KINDS[filter];
  return kinds === null || kinds.includes(kind);
}

/** Like `matchesFilter`, but "Gestión" also keeps the management commands (they are commands). */
function keeps(result: PaletteResult, filter: PaletteFilter): boolean {
  if (filter === 'management') return result.area === 'management';
  return matchesFilter(result.kind, filter);
}

function groupOf(kind: PaletteKind): PaletteGroupId {
  switch (kind) {
    case 'list':
      return 'lists';
    case 'item':
      return 'cards';
    case 'note':
    case 'expense':
      return 'notes';
    case 'product':
      return 'products';
    case 'ticket':
      return 'tickets';
    default:
      return 'commands';
  }
}

const GROUP_ORDER: readonly PaletteGroupId[] = [
  'lists',
  'cards',
  'notes',
  'products',
  'tickets',
  'commands',
];

function groupLabel(id: PaletteGroupId, rows: readonly PaletteResult[]): string {
  switch (id) {
    case 'lists':
      return 'Listas';
    case 'cards':
      return 'Tarjetas';
    case 'products':
      return 'Productos';
    case 'tickets':
      return 'Tickets';
    case 'commands':
      return 'Comandos';
    default: {
      // Notes and expenses share a group; the title says what is really in it.
      const hasNotes = rows.some((row) => row.kind === 'note');
      const hasExpenses = rows.some((row) => row.kind === 'expense');
      if (hasNotes && hasExpenses) return 'Notas y gastos';
      return hasExpenses ? 'Gastos' : 'Notas';
    }
  }
}

/**
 * Filters by type, groups in the fixed order Lists, Cards, Notes and expenses, Products, Tickets, Commands, trims
 * each type and numbers the rows continuously so the up/down keys walk them top to bottom.
 */
export function groupResults(
  results: readonly PaletteResult[],
  filter: PaletteFilter,
): PaletteGroup[] {
  const buckets = new Map<PaletteGroupId, PaletteResult[]>();
  for (const result of results) {
    if (!keeps(result, filter)) continue;
    const id = groupOf(result.kind);
    const bucket = buckets.get(id) ?? [];
    bucket.push(result);
    buckets.set(id, bucket);
  }

  const groups: PaletteGroup[] = [];
  let index = 0;
  for (const id of GROUP_ORDER) {
    const bucket = buckets.get(id);
    if (!bucket?.length) continue;
    const counts = new Map<PaletteKind, number>();
    const kept = bucket.filter((result) => {
      const count = counts.get(result.kind) ?? 0;
      counts.set(result.kind, count + 1);
      return count < (filter === 'all' ? KIND_LIMIT[result.kind] : FILTERED_LIMIT);
    });
    groups.push({
      id,
      label: groupLabel(id, kept),
      rows: kept.map((result) => ({ ...result, index: index++ })),
    });
  }
  return groups;
}

export function flattenGroups(groups: readonly PaletteGroup[]): PaletteRow[] {
  return groups.flatMap((group) => group.rows);
}

// --- Keyboard ------------------------------------------------------------------------------------

/** Moves the selection `delta` positions, wrapping at the ends. With no rows, 0. */
export function moveSelection(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

/** Next (or previous, with `delta` -1) filter in the chip list, in a circle. */
export function cycleFilter(current: PaletteFilter, delta: 1 | -1): PaletteFilter {
  const index = PALETTE_FILTERS.findIndex((filter) => filter.id === current);
  return PALETTE_FILTERS[moveSelection(index, delta, PALETTE_FILTERS.length)]!.id;
}
