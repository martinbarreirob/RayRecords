const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  // es-ES no agrupa los miles de 4 cifras por defecto. El tipo de `lib.dom` aún solo admite booleanos.
  useGrouping: 'always' as unknown as boolean,
});

/** Céntimos → «1.234,56 €». */
export function formatCents(cents: number): string {
  return euros.format(cents / 100);
}

/** Texto de un importe en euros («89,50» o «89.5») → céntimos, o `null` si no es un número. */
export function eurosToCents(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
