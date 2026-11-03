import { createHash } from 'node:crypto';

export interface HashInput {
  accountId: string;
  /** `YYYY-MM-DD` */
  date: string;
  amountCents: number;
  descriptionNorm: string;
  balanceAfterCents?: number | null;
  /** N.º de orden entre movimientos idénticos del mismo extracto (0 para el primero). */
  occurrence: number;
}

/**
 * Huella de una transacción para la deduplicación (índice único `{accountId, hash}`).
 * El `occurrence` evita descartar dos movimientos legítimamente iguales (dos cafés el mismo día),
 * y como depende solo del orden dentro del día, reimportar un extracto solapado produce los mismos hashes.
 */
export function transactionHash(input: HashInput): string {
  const payload = JSON.stringify([
    input.accountId,
    input.date,
    input.amountCents,
    input.descriptionNorm,
    input.balanceAfterCents ?? null,
    input.occurrence,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

/** Para cada clave, cuántas veces ha aparecido ya antes en la lista (0, 1, 2…). */
export function assignOccurrences(keys: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
}
