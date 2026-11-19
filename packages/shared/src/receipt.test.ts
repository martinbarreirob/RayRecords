import { describe, expect, it } from 'vitest';
import { EMPTY_SHOP, buildReceipt } from './receipt';
import type { Ticket } from './schemas/sales';

const ticket: Ticket = {
  id: 'a'.repeat(24),
  number: 12,
  lines: [
    { productId: 'b'.repeat(24), name: ' Agua 50 cl ', quantity: 3, unitPriceCents: 120 },
    { productId: 'c'.repeat(24), name: 'Café', quantity: 1, unitPriceCents: 250 },
  ],
  totalCents: 610,
  createdAt: '2026-11-19T10:30:00.000Z',
};

describe('buildReceipt', () => {
  it('keeps an inline image as the logo and drops anything else', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    expect(buildReceipt(ticket, { ...EMPTY_SHOP, logo }).shop.logo).toBe(logo);
    for (const bad of [
      'https://example.com/a.png',
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
    ]) {
      expect(buildReceipt(ticket, { ...EMPTY_SHOP, logo: bad }).shop.logo).toBe('');
    }
  });

  it('gives each line its own total and counts the units', () => {
    const receipt = buildReceipt(ticket, EMPTY_SHOP);
    expect(receipt.lines.map((line) => line.totalCents)).toEqual([360, 250]);
    expect(receipt.units).toBe(4);
    expect(receipt.number).toBe(12);
    expect(receipt.totalCents).toBe(610);
    expect(receipt.createdAt).toBe(ticket.createdAt);
  });

  it('trims the names and the texts of the shop', () => {
    const receipt = buildReceipt(ticket, {
      logo: '',
      name: '  Tienda  ',
      address: ' Calle Mayor 1 ',
      taxId: ' B12345678 ',
      footer: ' Gracias ',
    });
    expect(receipt.lines[0]?.name).toBe('Agua 50 cl');
    expect(receipt.shop).toEqual({
      logo: '',
      name: 'Tienda',
      address: 'Calle Mayor 1',
      taxId: 'B12345678',
      footer: 'Gracias',
    });
  });
});
