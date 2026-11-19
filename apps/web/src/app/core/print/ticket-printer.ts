import { Injectable, inject } from '@angular/core';
import { buildReceipt, DEFAULT_TIME_ZONE, type Ticket } from '@rayrecords/shared';
import { formatCents } from '../format';
import { PrintSettingsStore } from './print-settings';
import { receiptHtml, type ReceiptFormat } from './receipt-html';

/** A frame that never gets its `afterprint` (the dialog was closed some odd way) is removed anyway. */
const FRAME_LIFETIME_MS = 60_000;

const DATE = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DEFAULT_TIME_ZONE,
});

/** The language of a receipt: euros and the date of the app's time zone. */
export const RECEIPT_FORMAT: ReceiptFormat = {
  money: formatCents,
  date: (iso) => DATE.format(new Date(iso)).replace(/\./g, ''),
};

/**
 * Prints a ticket as a receipt with the browser's own print: the receipt goes into a hidden frame
 * and that frame is printed, so the app's page is never touched. The roll's width is in the
 * receipt's `@page`; the driver chosen in the print dialog does the rest. A thermal printer that
 * needs raw ESC/POS (cutter, cash drawer) would be another implementation of `print`.
 */
@Injectable({ providedIn: 'root' })
export class TicketPrinter {
  private readonly settings = inject(PrintSettingsStore);

  print(ticket: Ticket): void {
    const { shop, width } = this.settings.settings();
    const html = receiptHtml(buildReceipt(ticket, shop), width, RECEIPT_FORMAT);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    const remove = () => frame.remove();
    frame.addEventListener(
      'load',
      () => {
        const view = frame.contentWindow;
        if (!view) return remove();
        view.addEventListener('afterprint', remove, { once: true });
        view.focus();
        view.print();
      },
      { once: true },
    );
    setTimeout(remove, FRAME_LIFETIME_MS);
    frame.srcdoc = html;
    document.body.appendChild(frame);
  }
}
