/** Lowercase and accent-free, so "cafe" finds "Café". Zod-free: safe for any module of the web. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
