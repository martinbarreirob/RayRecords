/** "Bebidas", "bebidas" and "Bébidas" are the same name. */
export function categoryNameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * The key of an expense category made from its name ("Ocio y cultura" is `ocio_y_cultura`):
 * lowercase, no accents, underscores, starting with a letter and at most 40 characters. The same
 * rule as `keyFromName` in the web app.
 */
export function keyFromName(name: string): string {
  const key = categoryNameKey(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withLetter = key === '' ? 'categoria' : /^[a-z]/.test(key) ? key : `c_${key}`;
  return withLetter.slice(0, 40).replace(/_+$/g, '');
}

/** The key made from a name, with a number added until it is not one of `taken`. */
export function freeKey(name: string, taken: ReadonlySet<string>): string {
  const base = keyFromName(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
