import type { Ticket } from './schemas/sales';

/*
 * The receipt of a ticket, as data: what is printed, with no layout. Every way of printing (the
 * HTML of the browser today, ESC/POS bytes for a thermal printer later) draws from this one model.
 * No Zod here, so the web can import it without pulling Zod into its bundle.
 */

/** Who issues the receipt: every field is optional text and a blank one is not printed. */
export interface ReceiptShop {
  /** An image at the top (a data URL, already small and in grey tones); empty for none. */
  logo: string;
  /** The title: the name of the business. */
  name: string;
  address: string;
  taxId: string;
  /** A closing line ("Gracias por su compra"). */
  footer: string;
}

export const EMPTY_SHOP: ReceiptShop = { logo: '', name: '', address: '', taxId: '', footer: '' };

/** A logo is only ever an inline image: anything else is dropped before it reaches a page. */
export const LOGO_PATTERN = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** Paper widths of thermal rolls, in millimetres. */
export const PAPER_WIDTHS = [58, 80] as const;
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface Receipt {
  shop: ReceiptShop;
  number: number;
  /** ISO instant; the printer formats it in the app's time zone. */
  createdAt: string;
  lines: ReceiptLine[];
  /** Units over every line. */
  units: number;
  totalCents: number;
}

/** The receipt of a ticket: the shop's texts trimmed, each line with its own total. */
export function buildReceipt(ticket: Ticket, shop: ReceiptShop): Receipt {
  const lines = ticket.lines.map((line) => ({
    name: line.name.trim(),
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    totalCents: line.quantity * line.unitPriceCents,
  }));
  return {
    shop: {
      logo: LOGO_PATTERN.test(shop.logo) ? shop.logo : '',
      name: shop.name.trim(),
      address: shop.address.trim(),
      taxId: shop.taxId.trim(),
      footer: shop.footer.trim(),
    },
    number: ticket.number,
    createdAt: ticket.createdAt,
    lines,
    units: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: ticket.totalCents,
  };
}
