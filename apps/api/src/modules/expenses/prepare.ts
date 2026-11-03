import type { DateOnly } from '@rayrecords/shared';
import { monthOf } from '@rayrecords/shared';
import type { ObjectId } from 'mongodb';
import type { TransactionDoc } from '../../db/documents';
import { categorize, type Rule } from './categorize';
import { assignOccurrences, transactionHash } from './hash';
import { normalizeDescription } from './normalize';

/** Una fila ya interpretada de un extracto (el parseo del CSV del banco vive aparte). */
export interface RawTransaction {
  date: DateOnly;
  description: string;
  /** Gastos negativos, ingresos positivos. */
  amountCents: number;
  balanceAfterCents?: number;
}

/**
 * Convierte las filas de UN extracto en documentos listos para insertar: normaliza la descripción,
 * calcula el hash de deduplicación y aplica las reglas de categorización.
 * Las filas deben venir en el orden del fichero: de él depende el n.º de repetición del hash.
 * Es el paso común al seeder y al importador de CSV.
 */
export function prepareTransactions(params: {
  accountId: ObjectId;
  rows: readonly RawTransaction[];
  rules: readonly Rule[];
  importBatchId?: ObjectId;
}): Omit<TransactionDoc, '_id'>[] {
  const { accountId, rows, rules, importBatchId } = params;
  const prepared = rows.map((row) => ({
    row,
    descriptionNorm: normalizeDescription(row.description),
  }));
  const occurrences = assignOccurrences(
    prepared.map(({ row, descriptionNorm }) => `${row.date}|${row.amountCents}|${descriptionNorm}`),
  );

  return prepared.map(({ row, descriptionNorm }, i) => {
    const category = categorize(descriptionNorm, rules);
    return {
      accountId,
      date: new Date(`${row.date}T00:00:00Z`),
      month: monthOf(row.date),
      amountCents: row.amountCents,
      description: row.description,
      descriptionNorm,
      ...(row.balanceAfterCents !== undefined && { balanceAfterCents: row.balanceAfterCents }),
      hash: transactionHash({
        accountId: accountId.toHexString(),
        date: row.date,
        amountCents: row.amountCents,
        descriptionNorm,
        balanceAfterCents: row.balanceAfterCents ?? null,
        occurrence: occurrences[i]!,
      }),
      category,
      categorySource: category === null ? ('none' as const) : ('rule' as const),
      ...(importBatchId && { importBatchId }),
    };
  });
}
