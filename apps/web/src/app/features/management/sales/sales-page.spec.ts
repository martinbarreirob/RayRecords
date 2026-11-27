import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { CreateTicket, Product, StockCategory, Ticket } from '@rayrecords/shared';
import { NEVER, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { TicketPrinter } from '../../../core/print/ticket-printer';
import { CartStore } from './cart.store';
import { SalesPage } from './sales-page';

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
    costCents: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const water = product(1, { name: 'Agua', categoryId: DRINKS, quantity: 2, priceCents: 60 });
const coffee = product(2, { name: 'Café', categoryId: DRINKS, quantity: 12, priceCents: 350 });
const batteries = product(3, { name: 'Pilas', quantity: 0, priceCents: 500 });
const products = [water, coffee, batteries];

const ticket: Ticket = {
  id: 'c'.repeat(24),
  number: 7,
  lines: [],
  totalCents: 470,
  createdAt: '2026-11-18T10:00:00.000Z',
};

describe('SalesPage', () => {
  function setup(overrides: Partial<Record<keyof ApiClient, unknown>> = {}) {
    const api = {
      products: () => of(products),
      stockCategories: () => of(categories),
      topProducts: () => of([{ productId: coffee.id, units: 30 }]),
      createTicket: vi.fn((_input: CreateTicket) => of(ticket)),
      ...overrides,
    };
    const printer = { print: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: api },
        { provide: TicketPrinter, useValue: printer },
      ],
    });
    const fixture = TestBed.createComponent(SalesPage);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { fixture, api, printer };
  }

  const el = (fixture: ComponentFixture<SalesPage>) => fixture.nativeElement as HTMLElement;
  const tileNames = (fixture: ComponentFixture<SalesPage>) =>
    [...el(fixture).querySelectorAll('.tile-name')].map((node) => node.textContent?.trim());
  const tile = (fixture: ComponentFixture<SalesPage>, name: string) =>
    [...el(fixture).querySelectorAll<HTMLElement>('.tile')].find(
      (node) => node.querySelector('.tile-name')?.textContent?.trim() === name,
    )!;
  const lineNames = (fixture: ComponentFixture<SalesPage>) =>
    [...el(fixture).querySelectorAll('.line-name')].map((node) => node.textContent?.trim());
  const button = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) =>
        node.getAttribute('aria-label') === label || node.textContent?.trim().startsWith(label),
    )!;

  function addToCart(fixture: ComponentFixture<SalesPage>, name: string): void {
    tile(fixture, name).querySelector<HTMLButtonElement>('.add')!.click();
    fixture.detectChanges();
  }

  it('lets one or two products grow to three columns, and not more', () => {
    const { fixture } = setup({ products: () => of([water, coffee]) });
    const bento = el(fixture).querySelector('.bento')!;
    expect(bento.classList.contains('few')).toBe(true);
    // With room to grow, even a card that is not a best seller shows the word on its button.
    expect(tile(fixture, 'Agua').querySelector('.add')?.textContent).toContain('Añadir');
  });

  it('keeps the usual cards when there are more than two products', () => {
    const { fixture } = setup();
    expect(el(fixture).querySelector('.bento')!.classList.contains('few')).toBe(false);
  });

  it('announces the loading until the products arrive', () => {
    const { fixture } = setup({ products: () => NEVER });
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
  });

  it('shows the best seller first, on the large card', () => {
    const { fixture } = setup();
    expect(tileNames(fixture)).toEqual(['Café', 'Agua', 'Pilas']);
    expect(tile(fixture, 'Café').classList.contains('xl')).toBe(true);
    expect(tile(fixture, 'Agua').classList.contains('xl')).toBe(false);
  });

  it('a sold-out product can be neither added nor dragged', () => {
    const { fixture } = setup();
    const soldOut = tile(fixture, 'Pilas');
    expect(soldOut.querySelector<HTMLButtonElement>('.add')!.disabled).toBe(true);
    expect(soldOut.getAttribute('draggable')).toBeNull();
    expect(tile(fixture, 'Agua').getAttribute('draggable')).toBe('true');
  });

  const cat = (fixture: ComponentFixture<SalesPage>, label: string) =>
    [...el(fixture).querySelectorAll<HTMLButtonElement>('.cat')].find(
      (node) => node.textContent?.trim() === label,
    )!;

  it('puts the categories above the products and filters by the one picked', () => {
    const { fixture } = setup();
    const labels = [...el(fixture).querySelectorAll('.cat')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Todas', 'Bebidas', 'Sin categoría']);
    const bar = el(fixture).querySelector('.categories')!;
    const grid = el(fixture).querySelector('.tiles')!;
    expect(bar.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    cat(fixture, 'Bebidas').click();
    fixture.detectChanges();
    expect(tileNames(fixture)).toEqual(['Café', 'Agua']);
    expect(el(fixture).querySelector('.cat[aria-pressed="true"]')?.textContent?.trim()).toBe(
      'Bebidas',
    );
  });

  it('shows the arrows only when the categories do not fit, and they move the selection', () => {
    const { fixture } = setup();
    expect(button(el(fixture), 'Categoría siguiente')).toBeUndefined();

    // jsdom has no layout: say by hand that the strip needs more than the bar has.
    const strip = el(fixture).querySelector<HTMLElement>('.cat-strip')!;
    Object.defineProperty(strip, 'scrollWidth', { value: 900, configurable: true });
    Object.defineProperty(strip.parentElement!, 'clientWidth', { value: 600, configurable: true });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    // Both arrows are always on: they loop around the categories.
    button(el(fixture), 'Categoría siguiente').click();
    fixture.detectChanges();
    expect(tileNames(fixture)).toEqual(['Café', 'Agua']);

    // From the first category, back goes to the last one.
    button(el(fixture), 'Categoría anterior').click();
    button(el(fixture), 'Categoría anterior').click();
    fixture.detectChanges();
    expect(tileNames(fixture)).toEqual(['Pilas']);

    // And forwards from the last one goes back to the first.
    button(el(fixture), 'Categoría siguiente').click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.cat[aria-pressed="true"]')?.textContent?.trim()).toBe(
      'Todas',
    );

    Object.defineProperty(strip, 'scrollWidth', { value: 500, configurable: true });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    expect(button(el(fixture), 'Categoría anterior')).toBeUndefined();
  });

  it('lays a card out as name, stock, then price and the add button', () => {
    const { fixture } = setup();
    // A small card with no badge starts with the name and its button is just the plus.
    const small = tile(fixture, 'Agua');
    expect(small.querySelector('.tile-top')).toBeNull();
    expect(small.firstElementChild?.classList.contains('tile-name')).toBe(true);
    expect(small.children[1]?.textContent?.trim()).toBe('2 en stock');
    expect(small.querySelector('.tile-foot .tile-price')?.textContent).toContain('0,60');
    const add = small.querySelector<HTMLButtonElement>('.add')!;
    expect(add.classList.contains('icon')).toBe(true);
    expect(add.textContent?.trim()).toBe('');
    expect(add.getAttribute('aria-label')).toBe('Añadir Agua al carrito');

    // The best seller keeps its badge on top and the word on its button.
    const big = tile(fixture, 'Café');
    expect(big.querySelector('.tile-top')?.textContent).toContain('Más vendido');
    expect(big.querySelector('.add')?.textContent?.trim()).toBe('Añadir');
    expect(tile(fixture, 'Pilas').children[1]?.textContent?.trim()).toBe('Agotado');
  });

  it('opens and closes the cart sheet from its bar, with aria-expanded and Escape', () => {
    const { fixture } = setup();
    const toggle = el(fixture).querySelector<HTMLButtonElement>('.sheet-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    addToCart(fixture, 'Café');
    expect(toggle.textContent).toContain('1 artículo');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    el(fixture)
      .querySelector('.cart')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    // Not a phone in jsdom: Escape only acts on the sheet.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('empties the cart from the button next to its title', () => {
    const { fixture } = setup();
    const head = el(fixture).querySelector<HTMLElement>('.cart-head')!;
    expect(head.querySelector('.clear')).toBeNull();

    addToCart(fixture, 'Café');
    const clear = head.querySelector<HTMLButtonElement>('.clear')!;
    expect(clear.textContent?.trim()).toBe('Vaciar');
    // The phone shows a second, small "Vaciar" at the left of the print button.
    const footButtons = el(fixture).querySelectorAll('.cart-foot button');
    expect([...footButtons].map((b) => b.textContent?.trim())).toEqual([
      'Vaciar',
      'Imprimir ticket',
    ]);

    clear.click();
    fixture.detectChanges();
    expect(lineNames(fixture)).toEqual([]);
  });

  it('adds with the button, up to the stock, and totals the cart', () => {
    const { fixture } = setup();
    expect(el(fixture).querySelector('.cart-empty')).not.toBeNull();

    addToCart(fixture, 'Agua');
    addToCart(fixture, 'Agua');
    addToCart(fixture, 'Café');
    expect(lineNames(fixture)).toEqual(['Agua', 'Café']);
    expect(tile(fixture, 'Agua').querySelector<HTMLButtonElement>('.add')!.disabled).toBe(true);
    expect(el(fixture).querySelector('.cart-total strong')?.textContent).toContain('4,70');
  });

  it('adds a card dropped on the cart', () => {
    const { fixture } = setup();
    const cartBox = el(fixture).querySelector<HTMLElement>('.cart')!;
    tile(fixture, 'Café').dispatchEvent(new Event('dragstart'));
    fixture.detectChanges();
    expect(cartBox.classList.contains('drop-ready')).toBe(true);

    cartBox.dispatchEvent(new Event('drop'));
    fixture.detectChanges();
    expect(lineNames(fixture)).toEqual(['Café']);
    expect(cartBox.classList.contains('drop-ready')).toBe(false);
  });

  it('changes the quantity, corrects what is typed and removes a line', () => {
    const { fixture } = setup();
    addToCart(fixture, 'Café');
    const line = () => el(fixture).querySelector<HTMLElement>('.line')!;
    const input = () => line().querySelector<HTMLInputElement>('input')!;

    button(line(), 'Una unidad más').click();
    fixture.detectChanges();
    expect(input().value).toBe('2');

    input().value = '99';
    input().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(input().value).toBe('12');
    expect(button(line(), 'Una unidad más').disabled).toBe(true);

    button(line(), 'Quitar Café del carrito').click();
    fixture.detectChanges();
    expect(lineNames(fixture)).toEqual([]);
  });

  it('prints the ticket, empties the cart and stays on the sale', () => {
    const { fixture, api, printer } = setup();
    addToCart(fixture, 'Agua');
    addToCart(fixture, 'Café');
    button(el(fixture), 'Imprimir ticket').click();
    fixture.detectChanges();

    expect(api.createTicket).toHaveBeenCalledWith({
      lines: [
        { productId: water.id, quantity: 1 },
        { productId: coffee.id, quantity: 1 },
      ],
    });
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(printer.print).toHaveBeenCalledWith(ticket);
    expect(TestBed.inject(CartStore).lines()).toEqual([]);
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();

    // It says what was printed and links to it, until something else is sold.
    const notice = el(fixture).querySelector('.alert.success')!;
    expect(notice.textContent).toContain('Ticket n.º 7 impreso');
    expect(notice.querySelector('a')?.getAttribute('href')).toBe(
      `/gestion/tickets?ticket=${ticket.id}`,
    );
    addToCart(fixture, 'Agua');
    expect(el(fixture).querySelector('.alert.success')).toBeNull();
  });

  it('prints nothing when the ticket fails', () => {
    const { fixture, printer } = setup({
      createTicket: () => throwError(() => new Error('sin stock')),
    });
    addToCart(fixture, 'Agua');
    button(el(fixture), 'Imprimir ticket').click();
    fixture.detectChanges();
    expect(printer.print).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('.alert.success')).toBeNull();
  });

  it('keeps the cart and shows the error when the ticket fails', () => {
    const { fixture } = setup({
      createTicket: () => throwError(() => new Error('sin stock')),
    });
    addToCart(fixture, 'Café');
    button(el(fixture), 'Imprimir ticket').click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.alert[role="alert"]')).not.toBeNull();
    expect(lineNames(fixture)).toEqual(['Café']);
  });
});
