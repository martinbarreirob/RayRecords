/** Minúsculas, sin acentos y con espacios colapsados: base de las reglas y del hash. */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
