import type { RuleMatchType } from '@rayrecords/shared';

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
