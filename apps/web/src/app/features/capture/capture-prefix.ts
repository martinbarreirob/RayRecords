import { DEFAULT_LIST_ALIASES, type List } from '@rayrecords/shared';
import { normalize } from '../../core/palette/palette-logic';

/** A prefix to start a capture with: `compra:` leads to the Compras list. */
export interface PrefixOption {
  /** What is typed before the colon, as is (`compra`, `mañana`). */
  prefix: string;
  /** What it does: the list name or "Tarea para hoy". */
  label: string;
}

/** Maximum suggestions at once. */
const MAX_SUGGESTIONS = 3;
/** Letters to type before suggesting: with just one, almost every note would start with a suggestion. */
const MIN_LETTERS = 2;
/** A list prefix is one short word; with spaces or long it does not "look like a list". */
const LISTLIKE_RE = /^\p{L}[\p{L}\p{N}_-]{0,19}$/u;

/** Prefixes the parser always recognizes, whether or not lists with that alias exist. */
const DATE_PREFIXES: readonly PrefixOption[] = [
  { prefix: 'hoy', label: 'Tarea para hoy' },
  { prefix: 'mañana', label: 'Tarea para mañana' },
];

/**
 * Available prefixes: the alias of each list (the presets' while they have not loaded) and the date
 * ones. The order is the lists' order.
 */
export function prefixOptions(lists: readonly List[] | null): PrefixOption[] {
  const fromLists: PrefixOption[] = lists
    ? lists.flatMap((list) =>
        list.captureAlias && !list.archived
          ? [{ prefix: list.captureAlias, label: list.name }]
          : [],
      )
    : DEFAULT_LIST_ALIASES.map((alias) => ({ prefix: alias, label: alias }));
  return [...fromLists, ...DATE_PREFIXES];
}

/**
 * Prefixes that start like what was typed, to complete them with Tab. Only suggested while the text
 * is a single word without the colon ("com..."): once there is a space or ":" there is nothing to
 * complete. Matches by the prefix or by the start of the list name ("pel" gives `peli:` for
 * "Películas").
 */
export function suggestPrefixes(text: string, options: readonly PrefixOption[]): PrefixOption[] {
  const word = text.trimStart();
  if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(word)) return [];
  const typed = normalize(word);
  if (typed.length < MIN_LETTERS) return [];

  const byPrefix: PrefixOption[] = [];
  const byName: PrefixOption[] = [];
  for (const option of options) {
    if (normalize(option.prefix).startsWith(typed)) byPrefix.push(option);
    else if (normalize(option.label).startsWith(typed)) byName.push(option);
  }
  return [...byPrefix, ...byName].slice(0, MAX_SUGGESTIONS);
}

/** What is written when a suggestion is accepted: the prefix, the colon and a space. */
export function completion(option: PrefixOption): string {
  return `${option.prefix}: `;
}

/**
 * Prefix (what is typed before the colon) if it looks like a list one, real alias or not: a short
 * word. With spaces, bare numbers, links or long phrases it is `null`.
 */
export function listLikePrefix(text: string): string | null {
  const trimmed = text.normalize('NFC').trim();
  const colon = trimmed.indexOf(':');
  if (colon <= 0 || trimmed.slice(colon + 1).startsWith('//')) return null;
  const raw = trimmed.slice(0, colon).trim();
  return LISTLIKE_RE.test(raw) ? raw : null;
}

/** Edit distance, only to tell whether two prefixes look alike (<= 1: "compras" ~ "compra"). */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/** The known prefix most similar to an unknown one (`compras` gives `compra`), or `null`. */
export function closestPrefix(raw: string, options: readonly PrefixOption[]): PrefixOption | null {
  const typed = normalize(raw);
  if (typed.length < 3) return null;
  return (
    options.find((option) => {
      const known = normalize(option.prefix);
      return known.startsWith(typed) || typed.startsWith(known) || withinOneEdit(typed, known);
    }) ?? null
  );
}
