/** Lowercase, accent-free, whitespace collapsed: the basis for rules and the hash. */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
