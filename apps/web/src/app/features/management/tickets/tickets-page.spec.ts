import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_TIME_ZONE, todayIn, type Ticket } from '@rayrecords/shared';
import { NEVER, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, type TicketsQuery } from '../../../core/api/api-client';
import { providePrimeNgTheme } from '../../../core/theme/provide-primeng';
import { TicketPrinter } from '../../../core/print/ticket-printer';
import { TicketsPage } from './tickets-page';

function ticket(number: number, lines: [string, number, number][]): Ticket {
  return {
    id: String(number).padStart(24, '0'),
    number,
    lines: lines.map(([name, quantity, unitPriceCents], index) => ({
      productId: String(index).padStart(24, 'a'),
      name,
      quantity,
      unitPriceCents,
    })),
    totalCents: lines.reduce((sum, [, quantity, price]) => sum + quantity * price, 0),
    createdAt: '2026-11-18T09:32:00.000Z',
  };
}

const tickets = [
  ticket(3, [['Café molido', 2, 350]]),
  ticket(2, [
    ['Agua', 6, 60],
    ['Patatas', 1, 150],
  ]),
  ticket(1, [['Pilas', 1, 500]]),
];

describe('TicketsPage', () => {
  function setup(load: () => unknown = () => of(tickets), opened?: string) {
    const api = { tickets: vi.fn((_query?: TicketsQuery) => load()) };
    const printer = { print: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        providePrimeNgTheme(),
        { provide: ApiClient, useValue: api },
        { provide: TicketPrinter, useValue: printer },
      ],
    });
    const fixture = TestBed.createComponent(TicketsPage);
    if (opened) fixture.componentRef.setInput('ticket', opened);
    fixture.detectChanges();
    return { fixture, api, printer };
  }

  const el = (fixture: ComponentFixture<TicketsPage>) => fixture.nativeElement as HTMLElement;
  const numbers = (fixture: ComponentFixture<TicketsPage>) =>
    [...el(fixture).querySelectorAll('.open')].map((node) => node.textContent?.trim());
  const receiptTitle = (fixture: ComponentFixture<TicketsPage>) =>
    el(fixture).querySelector('.receipt h2')?.textContent?.trim();

  function type(fixture: ComponentFixture<TicketsPage>, text: string): void {
    const input = el(fixture).querySelector<HTMLInputElement>('.search input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('prints the ticket that is open from its receipt', () => {
    const { fixture, printer } = setup();
    const button = [...el(fixture).querySelectorAll<HTMLButtonElement>('.receipt button')].find(
      (node) => node.textContent?.trim() === 'Imprimir',
    )!;
    button.click();
    expect(printer.print).toHaveBeenCalledWith(
      expect.objectContaining({ id: tickets[0]!.id, number: 3 }),
    );
  });

  it('opens the print settings from the toolbar', () => {
    const { fixture } = setup();
    expect(document.querySelector('.print-settings-dialog')).toBeNull();
    el(fixture).querySelector<HTMLButtonElement>('.edit-receipt')!.click();
    fixture.detectChanges();
    expect(document.querySelector('.print-settings-dialog')).not.toBeNull();
  });

  it('announces the loading until the tickets arrive', () => {
    const { fixture, api } = setup(() => NEVER);
    expect(api.tickets).toHaveBeenCalledWith({ limit: 200 });
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
    expect(el(fixture).querySelector('.receipt-empty')).toBeNull();
  });

  it('lists the tickets and opens the newest one', () => {
    const { fixture } = setup();
    expect(numbers(fixture)).toEqual(['#3', '#2', '#1']);
    expect(receiptTitle(fixture)).toBe('Ticket n.º 3');
    expect(el(fixture).querySelector('.shown')?.textContent?.trim()).toContain('3 tickets');
    expect(el(fixture).querySelector('.shown')?.textContent).toContain('17,10');
    // The same count and total also close the list (shown there on a phone).
    expect(el(fixture).querySelector('.list .summary')?.textContent).toContain('3 tickets');
  });

  it('opens the receipt as a bottom sheet on a phone and closes it with Escape', () => {
    // jsdom has no matchMedia: a phone is one that says every query matches.
    const original = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    try {
      const { fixture } = setup();
      const receipt = el(fixture).querySelector('.receipt')!;
      expect(receipt.classList.contains('open')).toBe(false);
      el(fixture).querySelectorAll<HTMLElement>('.open')[1]!.click();
      fixture.detectChanges();
      expect(receipt.classList.contains('open')).toBe(true);
      expect(el(fixture).querySelector('.sheet-backdrop')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(receipt.classList.contains('open')).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('opens the ticket named in the address', () => {
    const { fixture } = setup(() => of(tickets), tickets[2]!.id);
    expect(receiptTitle(fixture)).toBe('Ticket n.º 1');
  });

  it('shows the lines and the total of the chosen ticket', () => {
    const { fixture } = setup();
    el(fixture).querySelectorAll<HTMLButtonElement>('.open')[1]!.click();
    fixture.detectChanges();

    expect(receiptTitle(fixture)).toBe('Ticket n.º 2');
    const lines = [...el(fixture).querySelectorAll('.receipt .lines li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('6 × Agua');
    expect(lines[0]).toContain('3,60');
    expect(el(fixture).querySelector('.receipt-foot')?.textContent).toContain('7 unidades');
    expect(el(fixture).querySelector('.receipt-foot strong')?.textContent).toContain('5,10');
    expect(el(fixture).querySelector('tr.selected .open')?.textContent?.trim()).toBe('#2');
  });

  it('searches by product and keeps a visible ticket open', () => {
    const { fixture } = setup();
    type(fixture, 'pilas');
    expect(numbers(fixture)).toEqual(['#1']);
    expect(receiptTitle(fixture)).toBe('Ticket n.º 1');

    type(fixture, 'zumo');
    expect(el(fixture).querySelector('.list .empty')?.textContent).toContain('Ningún ticket');
    expect(el(fixture).querySelector('.receipt-empty')).not.toBeNull();
  });

  it('keeps the date filters folded and asks the server again when a range is picked', () => {
    const { fixture, api } = setup();
    const panel = el(fixture).querySelector<HTMLElement>('#tickets-filters')!;
    expect(panel.hidden).toBe(true);
    el(fixture).querySelector<HTMLButtonElement>('.filters-toggle')!.click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);

    const preset = (label: string) =>
      [...panel.querySelectorAll<HTMLButtonElement>('.segmented button')].find(
        (button) => button.textContent?.trim() === label,
      )!;
    expect(preset('Todo').getAttribute('aria-pressed')).toBe('true');

    preset('Hoy').click();
    fixture.detectChanges();
    const today = todayIn(DEFAULT_TIME_ZONE);
    expect(api.tickets).toHaveBeenLastCalledWith({ limit: 200, from: today, to: today });
    expect(preset('Hoy').getAttribute('aria-pressed')).toBe('true');
    expect(el(fixture).querySelector('.filters-toggle .badge')?.textContent?.trim()).toBe('1');

    const clear = [...el(fixture).querySelectorAll<HTMLButtonElement>('.toolbar button')].find(
      (button) => button.textContent?.trim() === 'Quitar filtros',
    )!;
    clear.click();
    fixture.detectChanges();
    expect(api.tickets).toHaveBeenLastCalledWith({ limit: 200 });
    expect(el(fixture).querySelector('.filters-toggle .badge')).toBeNull();
  });

  it('says so when the chosen days have no tickets', () => {
    const { fixture } = setup(() => of([]));
    el(fixture).querySelector<HTMLButtonElement>('.segmented button:nth-child(2)')!.click();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.list .empty')?.textContent).toContain('esas fechas');
  });

  it('says where tickets come from when there are none', () => {
    const { fixture } = setup(() => of([]));
    expect(el(fixture).querySelector('.list .empty')?.textContent).toContain('Imprimir ticket');
  });

  it('shows the error when the tickets cannot be loaded', () => {
    const { fixture } = setup(() => throwError(() => new Error('sin conexión')));
    expect(el(fixture).querySelector('.alert[role="alert"]')).not.toBeNull();
  });
});
