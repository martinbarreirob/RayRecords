import { Injectable, signal } from '@angular/core';
import type { Product } from '@rayrecords/shared';
import { addToCart, removeLine, setQuantity, type CartLine } from './sales-logic';

/**
 * The cart being filled. It lives outside the sales screen so that leaving to check the stock and
 * coming back does not empty it; a reload does.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  readonly lines = signal<CartLine[]>([]);

  add(product: Product, amount = 1): void {
    this.lines.update((lines) => addToCart(lines, product, amount));
  }

  setQuantity(productId: string, quantity: number, max: number): void {
    this.lines.update((lines) => setQuantity(lines, productId, quantity, max));
  }

  remove(productId: string): void {
    this.lines.update((lines) => removeLine(lines, productId));
  }

  clear(): void {
    this.lines.set([]);
  }
}
