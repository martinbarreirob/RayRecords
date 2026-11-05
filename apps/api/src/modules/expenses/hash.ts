import { createHash } from 'node:crypto';

export interface HashInput {
  accountId: string;
  /** `YYYY-MM-DD` */
  date: string;
  amountCents: number;
  descriptionNorm: string;
  balanceAfterCents?: number | null;
  /** Position among identical transactions of the same statement (0 for the first). */
  occurrence: number;
}

/**
 * Fingerprint of a transaction for deduplication (unique index `{accountId, hash}`).
 * `occurrence` avoids dropping two legitimately identical transactions (two coffees on the same
 * day), and since it only depends on the order within the day, re-importing an overlapping
 * statement produces the same hashes.
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

/** For each key, how many times it already appeared earlier in the list (0, 1, 2, and so on). */
export function assignOccurrences(keys: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
}
