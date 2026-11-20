import { Router, provideRouter } from '@angular/router';
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

  it('applies ?buscar from the palette to the search box and clears the param', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        providePrimeNgTheme(),
        {
          provide: ApiClient,
          useValue: { products: () => of(products), stockCategories: () => of(categories) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?buscar=Caf%C3%A9');
    const fixture = TestBed.createComponent(StockPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector<HTMLInputElement>('.search input')!.value).toBe('Café');
    expect(names(fixture)).toEqual(['Café molido']);
    expect(router.url).not.toContain('buscar');
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
    // The navigation is just the buttons: no "1–10 of 37" next to them.
    expect(el(fixture).querySelector('.pager .p-paginator-current')).toBeNull();
    expect(el(fixture).querySelectorAll('.pager p-paginator')).toHaveLength(1);
    expect(el(fixture).querySelector('.pager')?.closest('.table-card')).toBeNull();
    expect(el(fixture).querySelector('.toolbar .totals')?.textContent).toContain('€');
    expect(el(fixture).querySelector('.foot')?.textContent).toContain('€');
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

  it('offers Editar and Eliminar from one options button per row (desktop)', () => {
    const fixture = loaded();
    const buttons = el(fixture).querySelectorAll<HTMLButtonElement>('tr.st-row .c-actions button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute('aria-haspopup')).toBe('menu');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Opciones: Agua');
    buttons[0]!.click();
    fixture.detectChanges();
    const labels = [...document.querySelectorAll('.p-menu-item-label')].map((n) =>
      n.textContent?.trim(),
    );
    expect(labels).toEqual(['Editar', 'Eliminar']);
  });

  it('shows a phone row as name, level, quantity, price and value, with no options button', () => {
    const fixture = loaded();
    const first = el(fixture).querySelector('tr.st-row')!;
    // The fields a phone row is made of, each in its own cell for the grid areas to place.
    for (const field of ['name', 'cat', 'qty', 'price', 'value']) {
      expect(first.querySelector('.c-' + field), field).not.toBeNull();
    }
    expect(first.querySelector('.c-name')?.textContent).toContain('Agua');
    expect(first.querySelector('.c-qty')?.textContent).toContain('Bajo');
  });

  it('opens a product in the bottom sheet on a phone, and Eliminar asks to confirm', async () => {
    const fixture = loaded();
    const page = fixture.componentInstance as unknown as {
      phone: { set(value: boolean): void };
    };
    page.phone.set(true);
    fixture.detectChanges();
    const sheet = el(fixture).querySelector<HTMLElement>('app-bottom-sheet .sheet')!;
    expect(sheet.classList.contains('is-closed')).toBe(true);
    expect(sheet.hasAttribute('inert')).toBe(true);

    el(fixture).querySelectorAll<HTMLElement>('tr.st-row')[1]!.click();
    fixture.detectChanges();
    expect(sheet.classList.contains('is-closed')).toBe(false);
    expect(sheet.classList.contains('is-expanded')).toBe(false);
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-label')).toBe('Producto: Café molido');
    expect(sheet.querySelector('.stats')?.textContent).toContain('12');
    const toggle = sheet.querySelector<HTMLButtonElement>('.toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Editar expands it to the form.
    const [edit, remove] = [...sheet.querySelectorAll<HTMLButtonElement>('.actions .btn')];
    expect(edit?.textContent?.trim()).toBe('Editar');
    edit!.click();
    fixture.detectChanges();
    expect(sheet.classList.contains('is-expanded')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(sheet.querySelector<HTMLInputElement>('#sheet-product-name')?.value).toBe('Café molido');

    // Escape closes it.
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(sheet.classList.contains('is-closed')).toBe(true);

    // Eliminar goes through the confirmation.
    el(fixture).querySelectorAll<HTMLElement>('tr.st-row')[0]!.click();
    fixture.detectChanges();
    remove!.click();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('¿Borrar «Agua» del stock?');
  });

  it('opens a new product directly expanded and empty on a phone', () => {
    const fixture = loaded();
    const page = fixture.componentInstance as unknown as {
      phone: { set(value: boolean): void };
      openCreate(): void;
    };
    page.phone.set(true);
    fixture.detectChanges();
    page.openCreate();
    fixture.detectChanges();
    const sheet = el(fixture).querySelector<HTMLElement>('app-bottom-sheet .sheet')!;
    expect(sheet.classList.contains('is-expanded')).toBe(true);
    expect(sheet.getAttribute('aria-label')).toBe('Nuevo producto');
    expect(sheet.querySelector<HTMLInputElement>('#sheet-product-name')?.value).toBe('');
    expect(document.querySelector('.product-dialog')).toBeNull();
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
