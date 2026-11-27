import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Dashboard, StockCategory } from '@rayrecords/shared';
import { NEVER, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../../core/api/api-client';
import { DashboardPage } from './dashboard-page';

const DRINKS = 'a'.repeat(24);
const categories: StockCategory[] = [
  {
    id: DRINKS,
    name: 'Bebidas',
    icon: 'bottle',
    color: '#e8effc',
    iconColor: '#1d4fb8',
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const dashboard: Dashboard = {
  from: '2026-11-17',
  to: '2026-11-19',
  days: [
    { date: '2026-11-17', totalCents: 1000, costCents: 400, tickets: 1, units: 2 },
    { date: '2026-11-18', totalCents: 4000, costCents: 1500, tickets: 2, units: 5 },
    { date: '2026-11-19', totalCents: 0, costCents: 0, tickets: 0, units: 0 },
  ],
  totals: { totalCents: 5000, costCents: 1900, tickets: 3, units: 7 },
  previous: { totalCents: 4000, costCents: 2000, tickets: 2, units: 4 },
  today: { totalCents: 0, costCents: 0, tickets: 0, units: 0 },
  topProducts: [
    { productId: 'b'.repeat(24), name: 'Agua', categoryId: DRINKS, units: 5, totalCents: 300 },
    { productId: 'c'.repeat(24), name: 'Café', categoryId: null, units: 2, totalCents: 700 },
  ],
  categories: [
    { categoryId: DRINKS, units: 6, totalCents: 4500 },
    { categoryId: null, units: 1, totalCents: 500 },
  ],
  stock: {
    products: 10,
    units: 120,
    valueCents: 98_765,
    costValueCents: 41_000,
    ok: 7,
    low: 2,
    out: 1,
  },
  topStock: [
    { id: 'b'.repeat(24), name: 'Agua', units: 5, quantity: 40, minQuantity: 0 },
    { id: 'd'.repeat(24), name: 'Pilas', units: 3, quantity: 0, minQuantity: 2 },
    { id: 'e'.repeat(24), name: 'Café', units: 2, quantity: 2, minQuantity: 5 },
  ],
  recentTickets: [
    {
      id: 'f'.repeat(24),
      number: 12,
      createdAt: '2026-11-18T09:32:00.000Z',
      totalCents: 2500,
      units: 3,
    },
  ],
};

const blank: Dashboard = {
  ...dashboard,
  totals: { totalCents: 0, costCents: 0, tickets: 0, units: 0 },
  previous: { totalCents: 0, costCents: 0, tickets: 0, units: 0 },
  days: dashboard.days.map((day) => ({
    ...day,
    totalCents: 0,
    costCents: 0,
    tickets: 0,
    units: 0,
  })),
  topProducts: [],
  categories: [],
  stock: { products: 0, units: 0, valueCents: 0, costValueCents: 0, ok: 0, low: 0, out: 0 },
  topStock: [],
  recentTickets: [],
};

describe('DashboardPage', () => {
  function setup(load: (days: number) => unknown = () => of(dashboard)) {
    const api = { dashboard: vi.fn(load), stockCategories: () => of(categories) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    return { fixture, api };
  }

  const el = (fixture: ComponentFixture<DashboardPage>) => fixture.nativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  // Without spaces: the templates do not always leave one between two inline elements.
  const squashed = (node: Element | null | undefined) => text(node).replace(/ /g, '');

  it('announces the loading until the figures arrive', () => {
    const { fixture, api } = setup(() => NEVER);
    expect(api.dashboard).toHaveBeenCalledWith(30);
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
  });

  it('shows the headline figures with their context', () => {
    const { fixture } = setup();
    const tiles = [...el(fixture).querySelectorAll('section.tile')].map((tile) => text(tile));
    expect(tiles[0]).toContain('50,00');
    expect(tiles[0]).toContain('+25 % frente a los 3 días anteriores');
    expect(tiles[0]).toContain('3 tickets · ticket medio 16,67');
    expect(tiles[2]).toContain('0 tickets');
    expect(tiles[3]).toContain('987,65');
    expect(tiles[3]).toContain('10 productos · 120 unidades');
    expect(tiles[3]).toContain('A coste 410,00');
  });

  it('shows the profit of the period, its margin and how it moved', () => {
    const { fixture } = setup();
    const tile = text(el(fixture).querySelectorAll('section.tile')[1]);
    // 5.000 of sales, 1.900 of cost: 31,00 € left, 62 % of the sales; before it was 20,00 €.
    expect(tile).toContain('Beneficio');
    expect(tile).toContain('31,00');
    expect(tile).toContain('Margen 62 % · coste 19,00');
    expect(tile).toContain('+55 % frente a los 3 días anteriores');
  });

  it('asks for the costs when the sales have none, instead of calling it all profit', () => {
    const noCosts: Dashboard = {
      ...dashboard,
      totals: { ...dashboard.totals, costCents: 0 },
      stock: { ...dashboard.stock, costValueCents: 0 },
    };
    const { fixture } = setup(() => of(noCosts));
    const tiles = [...el(fixture).querySelectorAll('section.tile')].map((tile) => text(tile));
    expect(tiles[1]).toContain('Sin costes');
    expect(tiles[1]).not.toContain('frente a los');
    expect(tiles[3]).not.toContain('A coste');
  });

  it('draws a bar per day scaled to the best one, with a table for screen readers', () => {
    const { fixture } = setup();
    const heights = [...el(fixture).querySelectorAll<HTMLElement>('.bars .bar')].map(
      (bar) => bar.style.height,
    );
    expect(heights).toEqual(['25%', '100%', '0%']);
    expect(text(el(fixture).querySelector('.readout'))).toContain('Mejor día: 40,00 € el 18 nov');
    expect(el(fixture).querySelectorAll('.daily table tbody tr')).toHaveLength(3);
  });

  it('reads out the day under the pointer', () => {
    const { fixture } = setup();
    const slot = el(fixture).querySelectorAll<HTMLElement>('.bars .slot')[0]!;
    slot.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(text(el(fixture).querySelector('.readout'))).toContain(
      '10,00 € martes, 17 de noviembre',
    );
    expect(slot.classList.contains('active')).toBe(true);

    el(fixture).querySelector('.bars')!.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(text(el(fixture).querySelector('.readout'))).toContain('Mejor día');
  });

  it('ranks best sellers and categories, the latter with their badge', () => {
    const { fixture } = setup();
    const [top, cats] = [...el(fixture).querySelectorAll('ol.rank')];
    expect([...top!.querySelectorAll('li')].map((li) => squashed(li))).toEqual(['Agua5', 'Café2']);
    const rows = [...cats!.querySelectorAll('li')];
    expect(text(rows[0])).toContain('Bebidas45,00');
    expect(rows[0]?.querySelector('app-category-badge')).not.toBeNull();
    expect(text(rows[1])).toContain('Sin categoría5,00');
    expect(rows[1]?.querySelector<HTMLElement>('.fill')?.style.width).toBe('11%');
  });

  it('shows the state of the stock with counts, and the stock left of the best sellers', () => {
    const { fixture } = setup();
    expect([...el(fixture).querySelectorAll('.legend li')].map((li) => text(li))).toEqual([
      'Con stock 7',
      'Stock bajo 2',
      'Agotado 1',
    ]);
    expect([...el(fixture).querySelectorAll('.stock-rank li')].map((li) => squashed(li))).toEqual([
      'Agua40enstock',
      'PilasAgotado',
      'CaféQuedan2',
    ]);
  });

  it('lists the recent tickets as a table, like the tickets screen', () => {
    const { fixture } = setup();
    const table = el(fixture).querySelector('table.recent')!;
    // No header row: the three columns are self-explanatory; the table is named by its card title.
    expect(table.querySelector('thead')).toBeNull();
    expect(table.getAttribute('aria-labelledby')).toBe('dash-recent');
    const link = table.querySelector<HTMLAnchorElement>('tbody a.number')!;
    expect(text(link)).toContain('#12');
    expect(link.getAttribute('href')).toBe(`/gestion/tickets?ticket=${'f'.repeat(24)}`);
  });

  it('asks for the new period when it changes', () => {
    const { fixture, api } = setup();
    const week = [...el(fixture).querySelectorAll<HTMLButtonElement>('.segmented button')].find(
      (button) => button.textContent?.trim() === '7 días',
    )!;
    week.click();
    fixture.detectChanges();
    expect(api.dashboard).toHaveBeenLastCalledWith(7);
    expect(week.getAttribute('aria-pressed')).toBe('true');
  });

  it('says what is missing when there are no sales and no products', () => {
    const { fixture } = setup(() => of(blank));
    expect(text(el(fixture).querySelector('.daily .none'))).toContain('Sin ventas en este periodo');
    expect(text(el(fixture).querySelector('.stock .none'))).toContain('Todavía no hay productos');
    expect(text(el(fixture).querySelector('section.tile .detail'))).toBe('Sin ventas todavía');
    expect(el(fixture).querySelector('.bars')).toBeNull();
  });

  it('shows the error when the dashboard cannot be loaded', () => {
    const { fixture } = setup(() => throwError(() => new Error('sin conexión')));
    expect(el(fixture).querySelector('.alert[role="alert"]')).not.toBeNull();
    expect(el(fixture).querySelector('[role="status"]')).toBeNull();
  });
});
