import { NO_CATEGORY } from '../../categories/uncategorized';
import type { CreateProduct, Product, StockCategory } from '@rayrecords/shared';
import { eurosToCents, formatCents } from '../../../core/format';
import { normalizeText } from '../../../core/text';

/** How a product stands: sold out, at or under its minimum, or fine. */
export type StockLevel = 'ok' | 'low' | 'out';

/** Category filter: every product, only the uncategorized ones, or one category id. */
export type CategoryFilter = 'all' | 'none' | (string & {});

export type LevelFilter = 'all' | StockLevel;

export interface StockFilters {
  query: string;
  category: CategoryFilter;
  level: LevelFilter;
}

export const NO_FILTERS: StockFilters = { query: '', category: 'all', level: 'all' };

export { NO_CATEGORY };

/** Product with everything the table sorts and filters by already resolved. */
export interface ProductRow extends Product {
  categoryName: string;
  /** The category itself, for its badge; `null` when the product has none. */
  category: StockCategory | null;
  level: StockLevel;
  /** Quantity times unit price. */
  valueCents: number;
  /** Unit price minus unit cost: what one unit leaves. */
  marginCents: number;
}

export const LEVEL_CHOICES: readonly { id: LevelFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'ok', label: 'Con stock' },
  { id: 'low', label: 'Stock bajo' },
  { id: 'out', label: 'Agotado' },
];

/** A minimum of 0 means the product has no low-stock warning. */
export function levelOf(product: Pick<Product, 'quantity' | 'minQuantity'>): StockLevel {
  if (product.quantity === 0) return 'out';
  if (product.minQuantity > 0 && product.quantity <= product.minQuantity) return 'low';
  return 'ok';
}

export function toRows(
  products: readonly Product[],
  categories: readonly StockCategory[],
): ProductRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return products.map((product) => {
    // A category deleted elsewhere reads as none until the list reloads.
    const category = (product.categoryId && byId.get(product.categoryId)) || null;
    return {
      ...product,
      category,
      categoryName: category?.name ?? NO_CATEGORY,
      level: levelOf(product),
      valueCents: product.quantity * product.priceCents,
      marginCents: product.priceCents - product.costCents,
    };
  });
}

/** The search looks at the name, the reference and the category, ignoring accents and case. */
export function filterProducts<T extends ProductRow>(
  rows: readonly T[],
  filters: StockFilters,
): T[] {
  const needle = normalizeText(filters.query);
  return rows.filter((row) => {
    if (filters.category === 'none' && row.categoryId !== null) return false;
    if (
      filters.category !== 'all' &&
      filters.category !== 'none' &&
      row.categoryId !== filters.category
    ) {
      return false;
    }
    if (filters.level !== 'all' && row.level !== filters.level) return false;
    if (needle === '') return true;
    return [row.name, row.sku ?? '', row.categoryName].some((text) =>
      normalizeText(text).includes(needle),
    );
  });
}

/** How many filters of the folding panel are on (the search box is not one of them). */
export function activeFilterCount(filters: StockFilters): number {
  return Number(filters.category !== 'all') + Number(filters.level !== 'all');
}

export interface StockTotals {
  units: number;
  valueCents: number;
}

/** Units and value of the products on screen (what the filters leave). */
export function stockTotals(rows: readonly ProductRow[]): StockTotals {
  return rows.reduce<StockTotals>(
    (totals, row) => ({
      units: totals.units + row.quantity,
      valueCents: totals.valueCents + row.valueCents,
    }),
    { units: 0, valueCents: 0 },
  );
}

/** How many products each category holds, by id. */
export function productCounts(products: readonly Product[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { categoryId } of products) {
    if (categoryId) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return counts;
}

/** Whole, non-negative number typed in a field; empty counts as 0. `null` if it is not one. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return /^\d{1,7}$/.test(trimmed) && Number(trimmed) <= 1_000_000 ? Number(trimmed) : null;
}

/** The product form as the user types it: everything is text. */
export interface ProductDraft {
  name: string;
  sku: string;
  categoryId: string | null;
  quantity: string;
  minQuantity: string;
  price: string;
  cost: string;
  notes: string;
}

export const EMPTY_DRAFT: ProductDraft = {
  name: '',
  sku: '',
  categoryId: null,
  quantity: '',
  minQuantity: '',
  price: '',
  cost: '',
  notes: '',
};

export function draftOf(product: Product): ProductDraft {
  return {
    name: product.name,
    sku: product.sku ?? '',
    categoryId: product.categoryId,
    quantity: String(product.quantity),
    minQuantity: product.minQuantity ? String(product.minQuantity) : '',
    price: product.priceCents ? (product.priceCents / 100).toFixed(2).replace('.', ',') : '',
    cost: product.costCents ? (product.costCents / 100).toFixed(2).replace('.', ',') : '',
    notes: product.notes ?? '',
  };
}

export type DraftField = 'name' | 'quantity' | 'minQuantity' | 'price' | 'cost';

/** Values ready to send. Empty `sku` and `notes` come as `null`, which clears them when editing. */
export interface ProductValues {
  name: string;
  sku: string | null;
  categoryId: string | null;
  quantity: number;
  minQuantity: number;
  priceCents: number;
  costCents: number;
  notes: string | null;
}

export type DraftResult =
  { ok: true; values: ProductValues } | { ok: false; field: DraftField; message: string };

export function readDraft(draft: ProductDraft): DraftResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, field: 'name', message: 'El nombre no puede estar vacío' };
  const quantity = parseQuantity(draft.quantity);
  if (quantity === null) {
    return { ok: false, field: 'quantity', message: 'La cantidad debe ser un número entero' };
  }
  const minQuantity = parseQuantity(draft.minQuantity);
  if (minQuantity === null) {
    return { ok: false, field: 'minQuantity', message: 'El mínimo debe ser un número entero' };
  }
  const priceCents = draft.price.trim() === '' ? 0 : eurosToCents(draft.price);
  if (priceCents === null || priceCents < 0) {
    return { ok: false, field: 'price', message: 'El precio no es válido; por ejemplo 12,50' };
  }
  const costCents = draft.cost.trim() === '' ? 0 : eurosToCents(draft.cost);
  if (costCents === null || costCents < 0) {
    return { ok: false, field: 'cost', message: 'El coste no es válido; por ejemplo 7,50' };
  }
  return {
    ok: true,
    values: {
      name,
      sku: draft.sku.trim() || null,
      categoryId: draft.categoryId,
      quantity,
      minQuantity,
      priceCents,
      costCents,
      notes: draft.notes.trim() || null,
    },
  };
}

/** A new product carries no empty fields. */
export function toCreate(values: ProductValues): CreateProduct {
  const { sku, notes, ...rest } = values;
  return { ...rest, ...(sku !== null && { sku }), ...(notes !== null && { notes }) };
}

/** What one unit leaves once its cost is paid: in euros and as a share of the price. */
export interface UnitMargin {
  cents: number;
  /** Whole percentage of the price; `null` when the price is 0. */
  percent: number | null;
}

export function unitMargin(priceCents: number, costCents: number): UnitMargin {
  const cents = priceCents - costCents;
  return { cents, percent: priceCents > 0 ? Math.round((cents / priceCents) * 100) : null };
}

/** "3,40 € (57 %)", or just the amount when there is no price to take a percentage of. */
export function marginText(priceCents: number, costCents: number): string {
  const { cents, percent } = unitMargin(priceCents, costCents);
  const amount = formatCents(cents);
  return percent === null ? amount : `${amount} (${percent} %)`;
}
