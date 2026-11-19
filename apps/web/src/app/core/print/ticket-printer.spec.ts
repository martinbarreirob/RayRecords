import { TestBed } from '@angular/core/testing';
import type { Ticket } from '@rayrecords/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintSettingsStore } from './print-settings';
import { TicketPrinter } from './ticket-printer';

const ticket: Ticket = {
  id: 'a'.repeat(24),
  number: 12,
  lines: [{ productId: 'b'.repeat(24), name: 'Café', quantity: 2, unitPriceCents: 150 }],
  totalCents: 300,
  createdAt: '2026-11-19T10:30:00.000Z',
};

describe('TicketPrinter', () => {
  // jsdom cannot print: the frame's window is a stand-in that records what is asked of it.
  const view = { addEventListener: vi.fn(), focus: vi.fn(), print: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(
      view as unknown as Window,
    );
  });
  afterEach(() => {
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('puts the receipt in a hidden frame, with the shop and the roll chosen', () => {
    TestBed.inject(PrintSettingsStore).save({
      shop: { logo: '', name: 'Tienda Ray', address: '', taxId: '', footer: '' },
      width: 58,
    });
    TestBed.inject(TicketPrinter).print(ticket);

    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.srcdoc).toContain('Tienda Ray');
    expect(frame.srcdoc).toContain('size: 58mm auto');
    expect(frame.srcdoc).toContain('Ticket n.º 12');
  });

  it('prints the frame once it has loaded and removes it afterwards', () => {
    TestBed.inject(TicketPrinter).print(ticket);

    const frame = document.querySelector('iframe')!;
    frame.dispatchEvent(new Event('load'));
    expect(view.print).toHaveBeenCalledTimes(1);

    const afterPrint = view.addEventListener.mock.calls.find(([name]) => name === 'afterprint')![1];
    afterPrint();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('removes the frame if the print dialog never reports back', () => {
    TestBed.inject(TicketPrinter).print(ticket);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});
