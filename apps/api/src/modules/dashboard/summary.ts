import { addDays, todayIn, type Dashboard, type SalesTotals } from '@rayrecords/shared';
import type { ProductDoc, TicketDoc } from '../../db/documents';

const TOP_PRODUCTS = 5;
const RESTOCK = 6;
const RECENT_TICKETS = 5;

const empty = (): SalesTotals => ({ totalCents: 0, tickets: 0, units: 0 });
const unitsOf = (ticket: TicketDoc) => ticket.lines.reduce((sum, line) => sum + line.quantity, 0);

function add(totals: SalesTotals, ticket: TicketDoc): void {
  totals.totalCents += ticket.totalCents;
  totals.tickets += 1;
  totals.units += unitsOf(ticket);
}

/**
 * The dashboard, from the tickets and the products. Pure: the route only fetches. `tickets` must
 * hold at least the period and the same span before it (older ones are ignored), newest first
 * or in any order.
 */
export function summarize(
  tickets: readonly TicketDoc[],
  products: readonly ProductDoc[],
  days: number,
  timeZone: string,
  now: Date = new Date(),
): Dashboard {
  const to = todayIn(timeZone, now);
  const from = addDays(to, -(days - 1));
  const previousFrom = addDays(from, -days);

  const byDay = new Map<string, SalesTotals>();
  for (let offset = 0; offset < days; offset++) byDay.set(addDays(from, offset), empty());
  const totals = empty();
  const previous = empty();

  const productById = new Map(products.map((product) => [product._id.toHexString(), product]));
  const sold = new Map<string, { name: string; units: number; totalCents: number }>();
  const byCategory = new Map<string | null, { units: number; totalCents: number }>();

  for (const ticket of tickets) {
    const day = todayIn(timeZone, ticket.createdAt);
    if (day > to || day < previousFrom) continue;
    if (day < from) {
      add(previous, ticket);
      continue;
    }
    add(totals, ticket);
    add(byDay.get(day)!, ticket);
    for (const line of ticket.lines) {
      const id = line.productId.toHexString();
      const cents = line.quantity * line.unitPriceCents;
      // The name of the moment of the sale; the last one seen wins if it was renamed.
      const product = sold.get(id) ?? { name: line.name, units: 0, totalCents: 0 };
      product.units += line.quantity;
      product.totalCents += cents;
      sold.set(id, product);

      // A product deleted since has no category any more.
      const categoryId = productById.get(id)?.categoryId?.toHexString() ?? null;
      const category = byCategory.get(categoryId) ?? { units: 0, totalCents: 0 };
      category.units += line.quantity;
      category.totalCents += cents;
      byCategory.set(categoryId, category);
    }
  }

  const stock = { products: products.length, units: 0, valueCents: 0, ok: 0, low: 0, out: 0 };
  const short: ProductDoc[] = [];
  for (const product of products) {
    stock.units += product.quantity;
    stock.valueCents += product.quantity * product.priceCents;
    if (product.quantity === 0) stock.out += 1;
    else if (product.minQuantity > 0 && product.quantity <= product.minQuantity) stock.low += 1;
    else stock.ok += 1;
    if (
      product.quantity === 0 ||
      (product.minQuantity > 0 && product.quantity <= product.minQuantity)
    ) {
      short.push(product);
    }
  }
  // Sold out first; then the ones that have used up most of their margin.
  const urgency = (product: ProductDoc) =>
    product.quantity === 0 ? -1 : product.quantity / product.minQuantity;
  short.sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name, 'es'));

  return {
    from,
    to,
    days: [...byDay].map(([date, day]) => ({ date, ...day })),
    totals,
    previous,
    today: byDay.get(to)!,
    topProducts: [...sold]
      .map(([productId, product]) => ({ productId, ...product }))
      .sort((a, b) => b.units - a.units || b.totalCents - a.totalCents)
      .slice(0, TOP_PRODUCTS),
    categories: [...byCategory]
      .map(([categoryId, category]) => ({ categoryId, ...category }))
      .sort((a, b) => b.totalCents - a.totalCents),
    stock,
    restock: short.slice(0, RESTOCK).map((product) => ({
      id: product._id.toHexString(),
      name: product.name,
      quantity: product.quantity,
      minQuantity: product.minQuantity,
    })),
    recentTickets: [...tickets]
      .sort((a, b) => b.number - a.number)
      .slice(0, RECENT_TICKETS)
      .map((ticket) => ({
        id: ticket._id.toHexString(),
        number: ticket.number,
        createdAt: ticket.createdAt.toISOString(),
        totalCents: ticket.totalCents,
        units: unitsOf(ticket),
      })),
  };
}
