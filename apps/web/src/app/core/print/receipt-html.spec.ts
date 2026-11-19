import { buildReceipt, type Ticket } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import { receiptHtml, type ReceiptFormat } from './receipt-html';

const format: ReceiptFormat = {
  money: (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`,
  date: () => '19 nov 2026, 10:30',
};

const ticket: Ticket = {
  id: 'a'.repeat(24),
  number: 12,
  lines: [
    { productId: 'b'.repeat(24), name: 'Agua <b>fría</b> & más', quantity: 3, unitPriceCents: 120 },
    { productId: 'c'.repeat(24), name: 'Café', quantity: 1, unitPriceCents: 250 },
  ],
  totalCents: 610,
  createdAt: '2026-11-19T10:30:00.000Z',
};

const shop = {
  logo: '',
  name: 'Tienda Ray',
  address: 'Calle Mayor 1',
  taxId: 'B123',
  footer: 'Gracias',
};

describe('receiptHtml', () => {
  it('draws the number, date, lines, units and total', () => {
    const html = receiptHtml(buildReceipt(ticket, shop), 80, format);
    expect(html).toContain('Ticket n.º 12');
    expect(html).toContain('19 nov 2026, 10:30');
    expect(html).toContain('3 × 1,20 €');
    expect(html).toContain('3,60 €');
    expect(html).toContain('4 artículos');
    expect(html).toContain('6,10 €');
  });

  it('prints the shop header and footer only when they are filled', () => {
    const full = receiptHtml(buildReceipt(ticket, shop), 80, format);
    expect(full).toContain('<h1>Tienda Ray</h1>');
    expect(full).toContain('NIF B123');
    expect(full).toContain('<footer>Gracias</footer>');

    const bare = receiptHtml(
      buildReceipt(ticket, { logo: '', name: '', address: '', taxId: '', footer: '' }),
      80,
      format,
    );
    expect(bare).not.toContain('<header>');
    expect(bare).not.toContain('<footer>');
  });

  it('draws the logo above the title, only when it is an inline image', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const html = receiptHtml(buildReceipt(ticket, { ...shop, logo }), 80, format);
    expect(html).toContain(`<img class="logo" alt="" src="${logo}">`);
    expect(html.indexOf('class="logo"')).toBeLessThan(html.indexOf('<h1>'));

    const other = receiptHtml(
      buildReceipt(ticket, { ...shop, logo: 'https://x.test/a.png' }),
      80,
      format,
    );
    expect(other).not.toContain('<img');
  });

  it('escapes what the user wrote', () => {
    const html = receiptHtml(buildReceipt(ticket, shop), 80, format);
    expect(html).not.toContain('<b>fría</b>');
    expect(html).toContain('Agua &lt;b&gt;fría&lt;/b&gt; &amp; más');
  });

  it('sizes the page to the roll', () => {
    expect(receiptHtml(buildReceipt(ticket, shop), 80, format)).toContain('size: 80mm auto');
    expect(receiptHtml(buildReceipt(ticket, shop), 58, format)).toContain('size: 58mm auto');
  });

  it('says "artículo" for a single unit', () => {
    const one = { ...ticket, lines: [ticket.lines[1]!], totalCents: 250 };
    expect(receiptHtml(buildReceipt(one, shop), 80, format)).toContain('1 artículo');
  });
});
