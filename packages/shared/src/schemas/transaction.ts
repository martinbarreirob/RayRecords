import { z } from 'zod';
import { Cents, DateOnlySchema, FieldKey, MonthSchema, ObjectIdString } from './common';

/** `rule`: asignada por una regla. `manual`: corregida por el usuario y nunca se sobrescribe. */
export const CategorySource = z.enum(['rule', 'manual', 'none']);
export type CategorySource = z.infer<typeof CategorySource>;

/**
 * DTO de una transacción. El hash de deduplicación y la descripción normalizada
 * son detalles internos de la API y no viajan al cliente.
 * Convención de signo: gastos negativos, ingresos positivos.
 */
export const TransactionSchema = z.object({
  id: ObjectIdString,
  accountId: ObjectIdString,
  date: DateOnlySchema,
  month: MonthSchema,
  amountCents: Cents,
  description: z.string().min(1).max(500),
  balanceAfterCents: Cents.optional(),
  category: FieldKey.nullable(),
  categorySource: CategorySource,
  importBatchId: ObjectIdString.optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

/** Corrección manual de categoría; `createRule` además guarda una regla para el futuro. */
export const SetTransactionCategorySchema = z.object({
  category: FieldKey.nullable(),
  createRule: z.boolean().default(false),
});
export type SetTransactionCategory = z.infer<typeof SetTransactionCategorySchema>;

/** Una fila del gráfico mensual: gasto o ingreso agregado por mes y categoría. */
export const MonthlyCategoryTotalSchema = z.object({
  month: MonthSchema,
  category: FieldKey.nullable(),
  totalCents: Cents,
  count: z.number().int().nonnegative(),
});
export type MonthlyCategoryTotal = z.infer<typeof MonthlyCategoryTotalSchema>;
