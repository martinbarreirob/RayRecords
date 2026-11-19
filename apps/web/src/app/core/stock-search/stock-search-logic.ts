import type { Product } from '@rayrecords/shared';
import { scoreAny, sortByScore } from '../palette/palette-logic';

/** Pure logic of the stock search dialog (no Angular), so it can be tested without the DOM. */

/** Most products listed at once: the search narrows them down, the list never has to scroll far. */
export const STOCK_SEARCH_LIMIT = 30;

/**
 * Products matching `query` by name, reference or notes, best first. With no query, all of them
 * by name. Capped at `limit`.
 */
export function searchStock(
  query: string,
  products: readonly Product[],
  limit = STOCK_SEARCH_LIMIT,
): Product[] {
  if (!query.trim()) {
    return [...products].sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, limit);
  }
  const scored = products
    .map((product) => ({
      product,
      score: scoreAny(query, [product.name, product.sku ?? '', product.notes ?? '']),
    }))
    .filter(({ score }) => score > 0);
  return sortByScore(scored)
    .slice(0, limit)
    .map(({ product }) => product);
}

/** What a product can do in the dialog: it can be sold only while there is stock. */
export function isSellable(product: Product, inCart: number): boolean {
  return product.quantity > inCart;
}
