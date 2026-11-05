const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  // es-ES does not group 4-digit thousands by default. The `lib.dom` type still only allows booleans.
  useGrouping: 'always' as unknown as boolean,
});

/** Cents to "1.234,56 €". */
export function formatCents(cents: number): string {
  return euros.format(cents / 100);
}

/** Euro amount text ("89,50" or "89.5") to cents, or `null` if it is not a number. */
export function eurosToCents(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
