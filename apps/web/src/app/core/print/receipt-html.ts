import type { PaperWidth, Receipt } from '@rayrecords/shared';

/** How the numbers and the date of a receipt are written (the printer does not know the locale). */
export interface ReceiptFormat {
  money: (cents: number) => string;
  date: (iso: string) => string;
}

/** Printable width of each roll, in mm: the paper minus the margins the heads cannot reach. */
const PRINTABLE_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 };

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * The receipt as a standalone HTML page sized to a thermal roll: `@page` takes the roll's width and
 * an automatic height, so the driver cuts where the content ends. Every text from the user is
 * escaped. Nothing here depends on the app's styles: the page is printed from an empty frame.
 */
export function receiptHtml(receipt: Receipt, width: PaperWidth, format: ReceiptFormat): string {
  const { shop } = receipt;
  const header = [
    shop.logo && `<img class="logo" alt="" src="${escapeHtml(shop.logo)}">`,
    shop.name && `<h1>${escapeHtml(shop.name)}</h1>`,
    shop.address && `<p>${escapeHtml(shop.address)}</p>`,
    shop.taxId && `<p>NIF ${escapeHtml(shop.taxId)}</p>`,
  ].filter(Boolean);

  const lines = receipt.lines
    .map(
      (line) => `
    <li>
      <span class="name">${escapeHtml(line.name)}</span>
      <span class="calc">${line.quantity} × ${escapeHtml(format.money(line.unitPriceCents))}</span>
      <span class="amount">${escapeHtml(format.money(line.totalCents))}</span>
    </li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket n.º ${receipt.number}</title>
<style>
  @page { size: ${width}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body {
    width: ${PRINTABLE_MM[width]}mm;
    margin: 0 auto;
    padding: 4mm 0;
    font: 12px/1.35 'Courier New', ui-monospace, monospace;
  }
  .logo { display: block; max-width: 100%; height: auto; margin: 0 auto 2mm; }
  h1 { margin: 0 0 1mm; font-size: 15px; text-align: center; }
  header p { margin: 0; text-align: center; }
  .meta { margin: 3mm 0; padding: 2mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  .meta p { display: flex; justify-content: space-between; margin: 0; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 1fr auto; margin-bottom: 1.5mm; }
  .name { grid-column: 1 / -1; overflow-wrap: anywhere; }
  .calc { padding-left: 2mm; }
  .amount { text-align: right; }
  .total { display: flex; justify-content: space-between; margin-top: 3mm; padding-top: 2mm; border-top: 1px dashed #000; font-size: 15px; font-weight: bold; }
  .units { margin: 1mm 0 0; }
  footer { margin-top: 4mm; text-align: center; }
</style>
</head>
<body>
${header.length ? `<header>${header.join('')}</header>` : ''}
<div class="meta">
  <p><span>Ticket n.º ${receipt.number}</span></p>
  <p><span>${escapeHtml(format.date(receipt.createdAt))}</span></p>
</div>
<ul>${lines}
</ul>
<div class="total"><span>TOTAL</span><span>${escapeHtml(format.money(receipt.totalCents))}</span></div>
<p class="units">${receipt.units} ${receipt.units === 1 ? 'artículo' : 'artículos'}</p>
${shop.footer ? `<footer>${escapeHtml(shop.footer)}</footer>` : ''}
</body>
</html>`;
}
