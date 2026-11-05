import {
  DEFAULT_CATEGORIES,
  type Category,
  type ReviewGroup,
  type Suggestion,
} from '@rayrecords/shared';
import { normalizeText } from './movements-logic';
import { keyFromName } from './rules-logic';

/** Tecla numérica → posición de la categoría: `1`–`9` son las nueve primeras y `0` la décima; `null` si no es un dígito. */
export function suggestionIndex(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return key === '0' ? 9 : Number(key) - 1;
}

/** Número de tecla que corresponde a una posición (`0` para la décima), o `null` si no tiene atajo. */
export function shortcutLabel(index: number): string | null {
  if (index < 0 || index > 9) return null;
  return index === 9 ? '0' : String(index + 1);
}

/** Categorías que encajan con lo escrito (sin acentos ni mayúsculas); las que empiezan por el texto, primero. */
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

/** Título legible del grupo: el comercio limpio, o el concepto original si no hay. */
export function groupTitle(group: Pick<ReviewGroup, 'merchantKey' | 'sampleDescription'>): string {
  const base = group.merchantKey ?? group.sampleDescription.split('\\')[0] ?? '';
  const text = base.replace(/\s+/g, ' ').trim() || group.sampleDescription;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Por qué se sugiere una categoría, en una frase corta. */
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

/** Progreso de la revisión: `done` de `total` movimientos, 0–100. */
export function progressPercent(done: number, total: number): number {
  return total <= 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
}

/** Añade al final los grupos nuevos que aún no están en la lista (por ids), sin duplicar. */
export function mergeGroups(current: readonly ReviewGroup[], incoming: readonly ReviewGroup[]) {
  const seen = new Set(current.flatMap((g) => g.ids));
  return [...current, ...incoming.filter((g) => !g.ids.some((id) => seen.has(id)))];
}

/**
 * Categoría nueva que se puede crear con lo escrito en el buscador, o `null` si no hay texto utilizable
 * o ya existe una con ese nombre o esa clave.
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
 * Orden de las tarjetas de categoría: de más a menos usada, con Otros siempre la última (es la tecla 0).
 * A igual uso gana el orden de serie y después el nombre. Se calcula una vez por sesión de revisión
 * para que el número de cada tarjeta no cambie mientras se decide.
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
