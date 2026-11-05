import {
  DEFAULT_CATEGORIES,
  type Category,
  type ReviewGroup,
  type Suggestion,
} from '@rayrecords/shared';
import { normalizeText } from './movements-logic';
import { keyFromName } from './rules-logic';

/** Number key to category position: `1`-`9` are the first nine and `0` the tenth; `null` if not a digit. */
export function suggestionIndex(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return key === '0' ? 9 : Number(key) - 1;
}

/** Key number for a position (`0` for the tenth), or `null` if it has no shortcut. */
export function shortcutLabel(index: number): string | null {
  if (index < 0 || index > 9) return null;
  return index === 9 ? '0' : String(index + 1);
}

/** Categories matching the typed text (ignoring accents and case); prefix matches first. */
export function matchCategories(
  categories: readonly Category[],
  query: string,
  limit = 6,
): Category[] {
  const needle = normalizeText(query);
  if (!needle) return [];
  const starts: Category[] = [];
  const contains: Category[] = [];
  for (const category of categories) {
    const name = normalizeText(category.name);
    if (name.startsWith(needle) || category.key.startsWith(needle)) starts.push(category);
    else if (name.includes(needle)) contains.push(category);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Readable group title: the clean merchant, or the original concept if there is none. */
export function groupTitle(group: Pick<ReviewGroup, 'merchantKey' | 'sampleDescription'>): string {
  const base = group.merchantKey ?? group.sampleDescription.split('\\')[0] ?? '';
  const text = base.replace(/\s+/g, ' ').trim() || group.sampleDescription;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Why a category is suggested, in one short phrase. */
export function sourceLabel(suggestion: Suggestion): string {
  switch (suggestion.source) {
    case 'history':
      return suggestion.count === 1
        ? 'ya la usaste 1 vez aquí'
        : `ya la usaste ${suggestion.count} veces aquí`;
    case 'rule':
      return 'por una regla';
    case 'hint':
      return 'por el nombre';
    case 'popular':
      return 'de las más usadas';
  }
}

/** Review progress: `done` of `total` movements, 0-100. */
export function progressPercent(done: number, total: number): number {
  return total <= 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
}

/** Appends groups not yet in the list (by id), without duplicates. */
export function mergeGroups(current: readonly ReviewGroup[], incoming: readonly ReviewGroup[]) {
  const seen = new Set(current.flatMap((g) => g.ids));
  return [...current, ...incoming.filter((g) => !g.ids.some((id) => seen.has(id)))];
}

/**
 * New category that can be created from the search text, or `null` if there is no usable text
 * or one with that name or key already exists.
 */
export function newCategoryFromQuery(
  query: string,
  categories: readonly Category[],
): { key: string; name: string } | null {
  const text = query.replace(/\s+/g, ' ').trim().slice(0, 60);
  const key = keyFromName(text);
  if (!key) return null;
  const needle = normalizeText(text);
  if (categories.some((c) => c.key === key || normalizeText(c.name) === needle)) return null;
  return { key, name: text.charAt(0).toUpperCase() + text.slice(1) };
}

/**
 * Order of the category cards: most to least used, with Otros always last (it is key 0).
 * Ties go to series order, then name. Computed once per review session so each card's
 * number does not change while deciding.
 */
export function orderByUsage(
  categories: readonly Category[],
  usage: readonly { category: string; count: number }[],
): Category[] {
  const count = new Map(usage.map((u) => [u.category, u.count]));
  const rank = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.key, i]));
  const last = (key: string) => (key === 'otros' ? 1 : 0);
  return [...categories].sort(
    (a, b) =>
      last(a.key) - last(b.key) ||
      (count.get(b.key) ?? 0) - (count.get(a.key) ?? 0) ||
      (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) ||
      a.name.localeCompare(b.name, 'es'),
  );
}
