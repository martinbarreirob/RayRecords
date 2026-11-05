import type { RuleMatchType } from '@rayrecords/shared';

/** Same rule as the API field key (`FIELD_KEY_RE` in shared); copied here to keep Zod out of the web bundle. */
const CATEGORY_KEY_RE = /^[a-z][a-zA-Z0-9_]{0,39}$/;

/** "Ocio y cultura" becomes `ocio_y_cultura`: lowercase, no accents, underscores, starting with a letter. */
export function keyFromName(name: string): string {
  const key = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withLetter = /^[a-z]/.test(key) || key === '' ? key : `c_${key}`;
  return withLetter.slice(0, 40).replace(/_+$/g, '');
}

/** Error message for a category key, or `null` if valid (an empty key is no error: nothing typed yet). */
export function categoryKeyError(key: string, existing: readonly string[]): string | null {
  const text = key.trim();
  if (text === '') return null;
  if (!CATEGORY_KEY_RE.test(text)) {
    return 'Empieza por una letra minúscula y usa solo letras, números o _ (máximo 40).';
  }
  if (existing.includes(text)) return 'Ya existe una categoría con esa clave.';
  return null;
}

/** Error message for a rule pattern, or `null` if valid. Only regular expressions can fail. */
export function patternError(matchType: RuleMatchType, pattern: string): string | null {
  if (matchType !== 'regex' || pattern.trim() === '') return null;
  try {
    new RegExp(pattern.trim(), 'i');
    return null;
  } catch {
    return 'La expresión regular no es válida.';
  }
}
