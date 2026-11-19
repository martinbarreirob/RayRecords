import { provideRouter } from '@angular/router';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Product, StockCategory } from '@rayrecords/shared';
import { NEVER, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { providePrimeNgTheme } from '../../../core/theme/provide-primeng';
import { StockPage } from './stock-page';

const LOOK = { icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' } as const;

const DRINKS = 'a'.repeat(24);

const categories: StockCategory[] = [
  { id: DRINKS, name: 'Bebidas', ...LOOK, createdAt: '2026-11-01T00:00:00.000Z' },
];

function product(id: number, overrides: Partial<Product>): Product {
  return {
    id: String(id).padStart(24, '0'),
    name: 'Producto',
    categoryId: null,
    quantity: 5,
    minQuantity: 0,
    priceCents: 100,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const products = [
  product(1, { name: 'Agua', categoryId: DRINKS, quantity: 2, minQuantity: 6 }),
  product(2, { name: 'Café molido', categoryId: DRINKS, quantity: 12 }),
  product(3, { name: 'Pilas', quantity: 0 }),
];

describe('StockPage', () => {
  function setup(api: Partial<Record<keyof ApiClient, unknown>>): ComponentFixture<StockPage> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), providePrimeNgTheme(), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(StockPage);
    fixture.detectChanges();
    return fixture;
  }

  const loaded = () =>
    setup({ products: () => of(products), stockCategories: () => of(categories) });

  const el = (fixture: ComponentFixture<StockPage>) => fixture.nativeElement as HTMLElement;
  const names = (fixture: ComponentFixture<StockPage>) =>
    [...el(fixture).querySelectorAll('tr.st-row .c-name .name')].map((node) =>
      node.textContent?.trim(),
    );

  function type(fixture: ComponentFixture<StockPage>, text: string): void {
    const input = el(fixture).querySelector<HTMLInputElement>('.search input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('announces the loading until the stock arrives', () => {
    const fixture = setup({ products: () => NEVER, stockCategories: () => NEVER });
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
    expect(el(fixture).querySelector('.empty-cell')).toBeNull();
  });

  it('lists the whole stock with its category and level', () => {
    const fixture = loaded();
    expect(names(fixture)).toEqual(['Agua', 'Café molido', 'Pilas']);
    const rows = [...el(fixture).querySelectorAll('tr.st-row')];
    expect(rows[0]?.querySelector('.cat')?.textContent?.trim()).toBe('Bebidas');
    expect(rows[0]?.querySelector('.badge')?.textContent?.trim()).toBe('Bajo');
    expect(rows[2]?.querySelector('.cat')?.textContent?.trim()).toBe('Sin categoría');
    expect(rows[2]?.querySelector('.badge')?.textContent?.trim()).toBe('Agotado');
    expect(el(fixture).querySelector('.shown span')?.textContent?.trim()).toBe('3 productos');
  });

  it('says so when there are no products yet', () => {
    const fixture = setup({ products: () => of([]), stockCategories: () => of([]) });
    expect(el(fixture).querySelector('.empty-cell')?.textContent).toContain(
      'Todavía no hay productos',
    );
  });

  it('searches ignoring accents', () => {
    const fixture = loaded();
    type(fixture, 'cafe');
    expect(names(fixture)).toEqual(['Café molido']);
    expect(el(fixture).querySelector('.shown span')?.textContent?.trim()).toBe('1 de 3 productos');
  });

  it('keeps the filters folded until asked for', () => {
    const fixture = loaded();
    const panel = el(fixture).querySelector<HTMLElement>('#stock-filters')!;
    const toggle = el(fixture).querySelector<HTMLButtonElement>('.filters-toggle')!;
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the filters over the table, and a click elsewhere or Escape closes them', () => {
    const fixture = loaded();
    const panel = el(fixture).querySelector<HTMLElement>('#stock-filters')!;
    const toggle = el(fixture).querySelector<HTMLButtonElement>('.filters-toggle')!;
    expect(panel.closest('.filters-wrap')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    panel.click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);

    document.body.click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(true);

    toggle.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(panel.hidden).toBe(true);
  });

  it('has one navigation, centered under the card, and the totals at the top right', () => {
    const fixture = loaded();
    expect(el(fixture).querySelectorAll('.pager p-paginator')).toHaveLength(1);
    expect(el(fixture).querySelector('.pager')?.closest('.table-card')).toBeNull();
    expect(el(fixture).querySelector('.toolbar .totals')?.textContent).toContain('€');
  });

  it('filters by level, counts the active filters and clears them', () => {
    const fixture = loaded();
    const out = [...el(fixture).querySelectorAll<HTMLButtonElement>('.segmented button')].find(
      (button) => button.textContent?.trim() === 'Agotado',
    )!;
    out.click();
    fixture.detectChanges();
    expect(names(fixture)).toEqual(['Pilas']);
    expect(el(fixture).querySelector('.filters-toggle .badge')?.textContent?.trim()).toBe('1');

    type(fixture, 'agua');
    expect(el(fixture).querySelector('.empty-cell')?.textContent).toContain(
      'Ningún producto coincide',
    );

    el(fixture).querySelector<HTMLButtonElement>('.empty-cell .btn')!.click();
    fixture.detectChanges();
    expect(names(fixture)).toHaveLength(3);
    expect(el(fixture).querySelector('.filters-toggle .badge')).toBeNull();
  });

  it('shows the error when the stock cannot be loaded', () => {
    const fixture = setup({
      products: () => throwError(() => new Error('sin conexión')),
      stockCategories: () => of(categories),
    });
    expect(el(fixture).querySelector('.alert[role="alert"]')).not.toBeNull();
    expect(el(fixture).querySelector('[role="status"]')).toBeNull();
  });
});
