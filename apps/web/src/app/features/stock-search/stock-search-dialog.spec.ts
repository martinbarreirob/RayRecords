import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Product } from '@rayrecords/shared';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../core/api/api-client';
import { StockSearchService } from '../../core/stock-search/stock-search.service';
import { CartStore } from '../management/sales/cart.store';
import { StockSearchDialog } from './stock-search-dialog';

const product = (id: string, name: string, quantity: number): Product => ({
  id: id.repeat(24),
  name,
  categoryId: null,
  quantity,
  minQuantity: 0,
  priceCents: 250,
  costCents: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const stock = [product('a', 'Tornillo', 5), product('b', 'Tuerca', 0), product('c', 'Arandela', 3)];

describe('StockSearchDialog', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: { products: () => of(stock) } },
      ],
    });
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(StockSearchDialog);
    fixture.detectChanges();
    return {
      fixture,
      service: TestBed.inject(StockSearchService),
      cart: TestBed.inject(CartStore),
      navigateByUrl,
      navigate,
    };
  }

  const el = (fixture: ComponentFixture<StockSearchDialog>) => fixture.nativeElement as HTMLElement;
  const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
  const names = (fixture: ComponentFixture<StockSearchDialog>) =>
    [...el(fixture).querySelectorAll('.row:not(.add) b')].map((b) => b.textContent?.trim());

  it('draws the panel only while open, also after a close', () => {
    const { fixture, service } = setup();
    expect(el(fixture).querySelector('.panel')).toBeNull();

    service.show();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.panel')).not.toBeNull();

    key('Escape');
    fixture.detectChanges();
    expect(service.isOpen()).toBe(false);
    expect(el(fixture).querySelector('.panel')).toBeNull();
  });

  it('lists the stock, narrows it as the user types and always ends with the add row', () => {
    const { fixture, service } = setup();
    service.show();
    fixture.detectChanges();
    expect(names(fixture)).toEqual(['Arandela', 'Tornillo', 'Tuerca']);

    const input = el(fixture).querySelector<HTMLInputElement>('input')!;
    input.value = 'tor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names(fixture)).toEqual(['Tornillo']);
    expect(el(fixture).querySelector('.row.add')).not.toBeNull();
  });

  it('puts the chosen product in the cart and goes to the sales screen', () => {
    const { fixture, service, cart, navigateByUrl } = setup();
    service.show();
    fixture.detectChanges();
    key('Enter');
    fixture.detectChanges();

    expect(cart.lines().map((line) => line.productId)).toEqual(['c'.repeat(24)]);
    expect(navigateByUrl).toHaveBeenCalledWith('/gestion/ventas');
    expect(service.isOpen()).toBe(false);
  });

  it('refuses a sold-out product, says so, and forgets the message when the user types', () => {
    const { fixture, service, cart } = setup();
    service.show();
    fixture.detectChanges();
    // Arandela, Tornillo, Tuerca (sold out).
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    fixture.detectChanges();
    expect(cart.lines()).toEqual([]);
    expect(service.isOpen()).toBe(true);
    expect(el(fixture).querySelector('.status')?.textContent).toContain('no tiene unidades');

    const input = el(fixture).querySelector<HTMLInputElement>('input')!;
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el(fixture).querySelector('.status')?.textContent).not.toContain('no tiene unidades');
  });

  it('opens the new product form from the last row', () => {
    const { fixture, service, navigate } = setup();
    service.show();
    fixture.detectChanges();
    el(fixture).querySelector<HTMLElement>('.row.add')!.click();
    expect(navigate).toHaveBeenCalledWith(['/gestion/stock'], { queryParams: { nuevo: 1 } });
    expect(service.isOpen()).toBe(false);
  });
});
