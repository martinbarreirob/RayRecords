import { z } from 'zod';
import { Cents, DateOnlySchema, IsoDateTime, ObjectIdString } from './common';

const Count = z.number().int().nonnegative();

/**
 * What was sold over some span: money, what those units cost the business, number of tickets and
 * units. The profit is `totalCents - costCents`.
 */
export const SalesTotalsSchema = z.object({
  totalCents: Cents.nonnegative(),
  costCents: Cents.nonnegative(),
  tickets: Count,
  units: Count,
});
export type SalesTotals = z.infer<typeof SalesTotalsSchema>;

/** How many days the dashboard can look back. */
export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export const DashboardQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((value) => (DASHBOARD_PERIODS as readonly number[]).includes(value), 'Invalid period')
    .default(30),
});

/**
 * Everything the management dashboard shows, worked out by the server in one go. Days are
 * calendar days in the app's time zone; the period ends today and `days` has one entry per day,
 * also for the days with no sales.
 */
export const DashboardSchema = z.object({
  from: DateOnlySchema,
  to: DateOnlySchema,
  days: z.array(SalesTotalsSchema.extend({ date: DateOnlySchema })),
  totals: SalesTotalsSchema,
  /** The same number of days right before the period, to compare against. */
  previous: SalesTotalsSchema,
  today: SalesTotalsSchema,
  /** Best sellers of the period by units, at most five. */
  topProducts: z.array(
    z.object({
      productId: ObjectIdString,
      name: z.string(),
      /** The product's current category; `null` when it has none or was deleted. */
      categoryId: ObjectIdString.nullable(),
      units: Count,
      totalCents: Cents.nonnegative(),
    }),
  ),
  /** Sales of the period by the product's current category; `null` gathers the rest. */
  categories: z.array(
    z.object({
      categoryId: ObjectIdString.nullable(),
      units: Count,
      totalCents: Cents.nonnegative(),
    }),
  ),
  /** The stock as it is now, whatever the period. */
  stock: z.object({
    products: Count,
    units: Count,
    /** What the stock would sell for at the unit price. */
    valueCents: Cents.nonnegative(),
    /** What the stock cost the business, at the unit cost. */
    costValueCents: Cents.nonnegative(),
    ok: Count,
    low: Count,
    out: Count,
  }),
  /**
   * The best sellers of the period still in the catalogue, most sold first, with the stock left
   * of each (`quantity`, against its `minQuantity`); at most six.
   */
  topStock: z.array(
    z.object({
      id: ObjectIdString,
      name: z.string(),
      units: Count,
      quantity: Count,
      minQuantity: Count,
    }),
  ),
  /** The last six tickets. */
  recentTickets: z.array(
    z.object({
      id: ObjectIdString,
      number: z.number().int().positive(),
      createdAt: IsoDateTime,
      totalCents: Cents.nonnegative(),
      units: Count,
    }),
  ),
});
export type Dashboard = z.infer<typeof DashboardSchema>;
