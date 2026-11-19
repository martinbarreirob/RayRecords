import { z } from 'zod';
import { Cents, DateOnlySchema, IsoDateTime, ObjectIdString } from './common';

const Count = z.number().int().nonnegative();

/** What was sold over some span: money, number of tickets and units. */
export const SalesTotalsSchema = z.object({
  totalCents: Cents.nonnegative(),
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
    valueCents: Cents.nonnegative(),
    ok: Count,
    low: Count,
    out: Count,
  }),
  /** Products sold out or at their minimum, the most urgent first; at most six. */
  restock: z.array(
    z.object({
      id: ObjectIdString,
      name: z.string(),
      quantity: Count,
      minQuantity: Count,
    }),
  ),
  /** The last five tickets. */
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
