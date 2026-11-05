import type { RuleMatchType } from '@rayrecords/shared';

/** Misma regla que la clave de campo de la API (`FIELD_KEY_RE` en shared); se copia aquí para no cargar Zod en la web. */
const CATEGORY_KEY_RE = /^[a-z][a-zA-Z0-9_]{0,39}$/;

/** «Ocio y cultura» → `ocio_y_cultura`: minúsculas, sin acentos, con guiones bajos y empezando por letra. */
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

/** Mensaje de error de una clave de categoría, o `null` si es válida (vacía tampoco da error: aún no se escribió). */
export function categoryKeyError(key: string, existing: readonly string[]): string | null {
  const text = key.trim();
  if (text === '') return null;
  if (!CATEGORY_KEY_RE.test(text)) {
    return 'Empieza por una letra minúscula y usa solo letras, números o _ (máximo 40).';
  }
  if (existing.includes(text)) return 'Ya existe una categoría con esa clave.';
  return null;
}

/** Mensaje de error de un patrón de regla, o `null` si es válido. Solo las expresiones regulares pueden fallar. */
export function patternError(matchType: RuleMatchType, pattern: string): string | null {
  if (matchType !== 'regex' || pattern.trim() === '') return null;
  try {
    new RegExp(pattern.trim(), 'i');
    return null;
  } catch {
    return 'La expresión regular no es válida.';
  }
}
