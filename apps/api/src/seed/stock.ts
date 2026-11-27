import type { StockCategory } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { ProductDoc, StockCategoryDoc, TicketDoc } from '../db/documents';
import { categoryNameKey } from '../modules/stock/routes';
import type { Rng } from './rng';

/** The sample shop sells accessories, bags, jewellery and clothes. */
export const SHOP_CATEGORIES = ['Accesorios', 'Bolsos', 'Joyería', 'Ropa'] as const;
type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Icon, square and icon color of each category. */
const CATEGORY_LOOKS: Record<ShopCategory, Pick<StockCategory, 'icon' | 'color' | 'iconColor'>> = {
  Accesorios: { icon: 'sunglasses', color: '#fdecc8', iconColor: '#b45309' },
  Bolsos: { icon: 'shopping-bag', color: '#e8effc', iconColor: '#1d4fb8' },
  Joyería: { icon: 'diamond', color: '#f6e1f9', iconColor: '#a21caf' },
  Ropa: { icon: 'shirt', color: '#d9f2ee', iconColor: '#0f766e' },
};

/**
 * name, reference, category, units before any sale, low-stock minimum, unit price in cents and
 * how popular it is (its weight when a sale picks a product).
 */
type Row = [string, string, ShopCategory | null, number, number, number, number];

const ROWS: Row[] = [
  // Accesorios
  ['Pañuelo de seda estampado', 'ACC-001', 'Accesorios', 40, 6, 2490, 9],
  ['Cinturón de piel marrón', 'ACC-002', 'Accesorios', 22, 4, 3450, 5],
  ['Gafas de sol redondas', 'ACC-003', 'Accesorios', 30, 5, 3990, 8],
  ['Gorro de lana', 'ACC-004', 'Accesorios', 14, 5, 1890, 6],
  ['Bufanda de punto gris', 'ACC-005', 'Accesorios', 18, 4, 2290, 5],
  ['Guantes de piel', 'ACC-006', 'Accesorios', 9, 3, 2990, 3],
  ['Sombrero de fieltro', 'ACC-007', 'Accesorios', 7, 2, 4500, 2],
  ['Coletero de terciopelo', 'ACC-008', 'Accesorios', 60, 10, 490, 10],
  ['Llavero de cuero', 'ACC-009', 'Accesorios', 35, 8, 890, 6],
  // Bolsos
  ['Bolso bandolera negro', 'BOL-001', 'Bolsos', 16, 3, 5990, 8],
  ['Bolso tote de lona', 'BOL-002', 'Bolsos', 28, 5, 2990, 9],
  ['Mochila de piel camel', 'BOL-003', 'Bolsos', 8, 2, 8900, 3],
  ['Cartera de mano dorada', 'BOL-004', 'Bolsos', 6, 2, 4990, 4],
  ['Riñonera de piel', 'BOL-005', 'Bolsos', 12, 3, 3490, 4],
  ['Monedero con cremallera', 'BOL-006', 'Bolsos', 26, 6, 1490, 7],
  ['Bolso de rafia', 'BOL-007', 'Bolsos', 0, 2, 3990, 0],
  ['Neceser de viaje', 'BOL-008', 'Bolsos', 15, 4, 1990, 4],
  // Joyería
  ['Pendientes de aro dorados', 'JOY-001', 'Joyería', 34, 6, 1890, 10],
  ['Collar de perlas', 'JOY-002', 'Joyería', 10, 2, 4990, 4],
  ['Pulsera de plata', 'JOY-003', 'Joyería', 20, 4, 2990, 7],
  ['Anillo ajustable', 'JOY-004', 'Joyería', 25, 5, 1290, 8],
  ['Gargantilla con colgante', 'JOY-005', 'Joyería', 13, 3, 2490, 6],
  ['Pendientes de botón', 'JOY-006', 'Joyería', 5, 4, 990, 7],
  ['Tobillera de cuentas', 'JOY-007', 'Joyería', 12, 0, 890, 3],
  ['Broche vintage', 'JOY-008', 'Joyería', 4, 1, 1990, 1],
  // Ropa
  ['Camiseta básica blanca', 'ROP-001', 'Ropa', 45, 10, 1490, 10],
  ['Camisa de lino', 'ROP-002', 'Ropa', 16, 4, 3990, 6],
  ['Jersey de punto beige', 'ROP-003', 'Ropa', 12, 4, 4590, 6],
  ['Vestido midi estampado', 'ROP-004', 'Ropa', 9, 3, 5990, 5],
  ['Vaquero recto', 'ROP-005', 'Ropa', 14, 4, 4990, 6],
  ['Falda plisada', 'ROP-006', 'Ropa', 8, 3, 3490, 3],
  ['Chaqueta vaquera', 'ROP-007', 'Ropa', 6, 2, 6990, 3],
  ['Blazer negro', 'ROP-008', 'Ropa', 5, 2, 7990, 2],
  ['Top de tirantes', 'ROP-009', 'Ropa', 3, 5, 1290, 6],
  ['Abrigo de paño', 'ROP-010', 'Ropa', 0, 1, 12900, 0],
  // No category
  ['Tarjeta regalo 25 €', 'REG-025', null, 50, 0, 2500, 2],
  ['Bolsa de regalo', 'REG-BOL', null, 80, 15, 150, 5],
];

/** How far back the sample sales go and how many there are. */
const SALES_DAYS = 30;
const SALES_COUNT = 48;
const OPENING_HOUR = 10;
const CLOSING_HOUR = 20;

export interface SeededStock {
  categories: StockCategoryDoc[];
  products: ProductDoc[];
  tickets: TicketDoc[];
}

/**
 * Stock of the sample shop and a month of its sales. The tickets are generated first-come and
 * never sell what is not there, so each product's quantity is what it started with minus what
 * its tickets sold: some end up low or sold out, and the popular ones lead the sales ranking.
 */
export function buildStock(now: Date, rng: Rng): SeededStock {
  const categories: StockCategoryDoc[] = SHOP_CATEGORIES.map((name) => ({
    _id: new ObjectId(),
    name,
    ...CATEGORY_LOOKS[name],
    nameKey: categoryNameKey(name),
    createdAt: now,
  }));
  const categoryIds = new Map(categories.map((category) => [category.name, category._id]));

  const products: ProductDoc[] = ROWS.map(
    ([name, sku, category, quantity, minQuantity, priceCents], index) => ({
      _id: new ObjectId(),
      name,
      sku,
      categoryId: (category && categoryIds.get(category)) || null,
      quantity,
      minQuantity,
      priceCents,
      costCents: unitCost(priceCents, index),
      createdAt: now,
      updatedAt: now,
    }),
  );

  // One entry per unit of weight: picking from it favours the popular products.
  const weighted = products.flatMap((product, index) =>
    Array.from({ length: ROWS[index]![6] }, () => product),
  );

  const times = Array.from({ length: SALES_COUNT }, () => saleTime(now, rng)).sort(
    (a, b) => a.getTime() - b.getTime(),
  );

  const tickets: TicketDoc[] = [];
  for (const createdAt of times) {
    const sold = new Map<ProductDoc, number>();
    for (let line = rng.int(1, 4); line > 0; line--) {
      const product = rng.pick(weighted);
      const quantity = Math.min(rng.int(1, 3), product.quantity);
      if (quantity === 0 || sold.has(product)) continue;
      product.quantity -= quantity;
      product.updatedAt = createdAt;
      sold.set(product, quantity);
    }
    if (!sold.size) continue;
    const lines = [...sold].map(([product, quantity]) => ({
      productId: product._id,
      name: product.name,
      quantity,
      unitPriceCents: product.priceCents,
      unitCostCents: product.costCents ?? 0,
    }));
    tickets.push({
      _id: new ObjectId(),
      number: tickets.length + 1,
      lines,
      totalCents: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
      createdAt,
    });
  }

  return { categories, products, tickets };
}

/**
 * What a product costs the business: between 30 % and 65 % of its price, varying by position so
 * the margins differ from one product to the next (no random numbers, so the sales do not shift).
 */
function unitCost(priceCents: number, index: number): number {
  return Math.round((priceCents * (30 + ((index * 7) % 36))) / 100);
}

/** A moment within shop hours on one of the last days, never after `now`. */
function saleTime(now: Date, rng: Rng): Date {
  const time = new Date(now);
  time.setDate(time.getDate() - rng.int(0, SALES_DAYS - 1));
  time.setHours(rng.int(OPENING_HOUR, CLOSING_HOUR - 1), rng.int(0, 59), rng.int(0, 59), 0);
  if (time > now) time.setDate(time.getDate() - 1);
  return time;
}
