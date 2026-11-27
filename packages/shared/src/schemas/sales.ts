import { z } from 'zod';
import { Cents, IsoDateTime, ObjectIdString } from './common';

const SoldQuantity = z.number().int().positive().max(1_000_000);

/** A line keeps the name and price of the moment: later edits to the product do not change it. */
export const TicketLineSchema = z.object({
  productId: ObjectIdString,
  name: z.string(),
  quantity: SoldQuantity,
  unitPriceCents: Cents.nonnegative(),
  /** The product's unit cost at the time of the sale; missing on tickets made before costs existed. */
  unitCostCents: Cents.nonnegative().optional(),
});
export type TicketLine = z.infer<typeof TicketLineSchema>;

export const TicketSchema = z.object({
  id: ObjectIdString,
  /** Consecutive, starting at 1. */
  number: z.number().int().positive(),
  lines: z.array(TicketLineSchema),
  totalCents: Cents.nonnegative(),
  createdAt: IsoDateTime,
});
export type Ticket = z.infer<typeof TicketSchema>;

/** The cart: which products and how many. Names and prices are read from the stock. */
export const CreateTicketSchema = z.object({
  lines: z
    .array(z.object({ productId: ObjectIdString, quantity: SoldQuantity }))
    .min(1)
    .max(200),
});
export type CreateTicket = z.infer<typeof CreateTicketSchema>;

/** Units of a product sold across every ticket. */
export const ProductSalesSchema = z.object({
  productId: ObjectIdString,
  units: z.number().int().nonnegative(),
});
export type ProductSales = z.infer<typeof ProductSalesSchema>;
