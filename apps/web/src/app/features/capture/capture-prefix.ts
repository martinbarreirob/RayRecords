import { DEFAULT_LIST_ALIASES, type List } from '@rayrecords/shared';
import { normalize } from '../../core/palette/palette-logic';

/** Un prefijo con el que empezar una captura: `compra:` lleva a la lista Compras. */
export interface PrefixOption {
  /** Lo que se escribe antes de los dos puntos, tal cual (`compra`, `mañana`). */
  prefix: string;
  /** Qué hace: el nombre de la lista o «Tarea para hoy». */
  label: string;
}

/** Máximo de sugerencias a la vez. */
const MAX_SUGGESTIONS = 3;
/** Letras que hay que escribir antes de sugerir: con una sola, casi toda nota empezaría con una sugerencia. */
const MIN_LETTERS = 2;
/** Un prefijo de lista es una sola palabra corta; con espacios o largo no «parece una lista». */
const LISTLIKE_RE = /^\p{L}[\p{L}\p{N}_-]{0,19}$/u;

/** Prefijos que el parser reconoce siempre, existan o no listas con ese alias. */
const DATE_PREFIXES: readonly PrefixOption[] = [
  { prefix: 'hoy', label: 'Tarea para hoy' },
  { prefix: 'mañana', label: 'Tarea para mañana' },
];

/**
 * Prefijos disponibles: el alias de cada lista (el de los presets mientras no han cargado) y los de
 * fecha. El orden es el de las listas.
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
 * Prefijos que empiezan como lo escrito, para completarlos con Tab. Solo se sugiere mientras el
 * texto es una única palabra sin los dos puntos («com…»): en cuanto hay un espacio o «:» ya no hay
 * nada que completar. Encaja por el prefijo o por el comienzo del nombre de la lista («pel» →
 * `peli:` por «Películas»).
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

/** Lo que se escribe al aceptar una sugerencia: el prefijo, los dos puntos y un espacio. */
export function completion(option: PrefixOption): string {
  return `${option.prefix}: `;
}

/**
 * Prefijo (lo escrito antes de los dos puntos) si parece el de una lista, sea o no un alias real:
 * una palabra corta. Con espacios, números sueltos, enlaces o frases largas es `null`.
 */
export function listLikePrefix(text: string): string | null {
  const trimmed = text.normalize('NFC').trim();
  const colon = trimmed.indexOf(':');
  if (colon <= 0 || trimmed.slice(colon + 1).startsWith('//')) return null;
  const raw = trimmed.slice(0, colon).trim();
  return LISTLIKE_RE.test(raw) ? raw : null;
}

/** Distancia de edición, solo para saber si dos prefijos se parecen (≤ 1: «compras» ~ «compra»). */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/** El prefijo conocido que más se parece a uno desconocido (`compras` → `compra`), o `null`. */
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
