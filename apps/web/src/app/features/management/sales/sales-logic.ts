import type { Product, ProductSales, StockCategory } from '@rayrecords/shared';
import { NO_CATEGORY, type CategoryFilter } from '../stock/stock-logic';

/** What the cart remembers: which product and how many. Name, price and stock come from the stock. */
export interface CartLine {
  productId: string;
  quantity: number;
}

/** A cart line ready to show. */
export interface CartRow extends CartLine {
  name: string;
  unitPriceCents: number;
  totalCents: number;
  /** Units in stock: the quantity cannot go above it. */
  max: number;
}

/** Size of a product card in the bento grid: the best sellers get the larger ones. */
export type TileSize = 'xl' | 'wide' | 'normal';

export interface Tile {
  product: Product;
  /** Units sold over every ticket. */
  units: number;
  size: TileSize;
}

export interface CategoryTab {
  id: CategoryFilter;
  label: string;
  /** The category behind the tab, for its badge; "Todas" and "Sin categoría" have none. */
  category?: StockCategory;
}

/** How many of the best sellers on screen get the big card and how many the wide one. */
const XL_TILES = 2;
const WIDE_TILES = 3;

export function unitsByProduct(sales: readonly ProductSales[]): Map<string, number> {
  return new Map(sales.map((row) => [row.productId, row.units]));
}

export function inCategory(product: Product, category: CategoryFilter): boolean {
  if (category === 'all') return true;
  if (category === 'none') return product.categoryId === null;
  return product.categoryId === category;
}

/**
 * Cards of a category, best sellers first (then by name). The ranking is within what is on
 * screen, so every category has its own large cards; a product never sold stays small.
 */
export function bentoTiles(
  products: readonly Product[],
  units: ReadonlyMap<string, number>,
  category: CategoryFilter,
): Tile[] {
  return products
    .filter((product) => inCategory(product, category))
    .map((product) => ({ product, units: units.get(product.id) ?? 0 }))
    .sort((a, b) => b.units - a.units || a.product.name.localeCompare(b.product.name, 'es'))
    .map(({ product, units: sold }, index) => ({
      product,
      units: sold,
      size:
        sold === 0
          ? 'normal'
          : index < XL_TILES
            ? 'xl'
            : index < XL_TILES + WIDE_TILES
              ? 'wide'
              : 'normal',
    }));
}

/** "Todas", then the user's categories, then "Sin categoría" when some product has none. */
export function categoryTabs(
  categories: readonly StockCategory[],
  products: readonly Product[],
): CategoryTab[] {
  const tabs: CategoryTab[] = [
    { id: 'all', label: 'Todas' },
    ...categories.map((category) => ({ id: category.id, label: category.name, category })),
  ];
  if (categories.length && products.some((product) => product.categoryId === null)) {
    tabs.push({ id: 'none', label: NO_CATEGORY });
  }
  return tabs;
}

/** The tab before or after the current one; the arrows go round at both ends. */
export function stepCategory(
  tabs: readonly CategoryTab[],
  current: CategoryFilter,
  delta: 1 | -1,
): CategoryFilter {
  if (!tabs.length) return 'all';
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === current),
  );
  return tabs[(index + delta + tabs.length) % tabs.length]!.id;
}

/** Units of a product already in the cart. */
export function quantityInCart(lines: readonly CartLine[], productId: string): number {
  return lines.find((line) => line.productId === productId)?.quantity ?? 0;
}

/** Adds units of a product, never going over its stock. A sold-out product is not added. */
export function addToCart(lines: readonly CartLine[], product: Product, amount = 1): CartLine[] {
  const current = quantityInCart(lines, product.id);
  const quantity = Math.min(current + amount, product.quantity);
  if (quantity <= 0 || quantity === current) return [...lines];
  return current
    ? lines.map((line) => (line.productId === product.id ? { ...line, quantity } : line))
    : [...lines, { productId: product.id, quantity }];
}

/** Sets the units of a line, between 1 and the stock. Use `removeLine` to take it out. */
export function setQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number,
  max: number,
): CartLine[] {
  const clamped = Math.max(1, Math.min(Math.trunc(quantity) || 1, max));
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: clamped } : line,
  );
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

/**
 * Cart lines against the current stock: a product deleted or sold out elsewhere drops out and a
 * quantity above what is left is lowered, so the cart on screen can always be sold.
 */
export function cartRows(lines: readonly CartLine[], products: readonly Product[]): CartRow[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || product.quantity === 0) return [];
    const quantity = Math.min(line.quantity, product.quantity);
    return [
      {
        productId: product.id,
        quantity,
        name: product.name,
        unitPriceCents: product.priceCents,
        totalCents: quantity * product.priceCents,
        max: product.quantity,
      },
    ];
  });
}

export function cartTotal(rows: readonly CartRow[]): { units: number; totalCents: number } {
  return rows.reduce(
    (total, row) => ({
      units: total.units + row.quantity,
      totalCents: total.totalCents + row.totalCents,
    }),
    { units: 0, totalCents: 0 },
  );
}
