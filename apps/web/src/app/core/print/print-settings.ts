import { Injectable, signal } from '@angular/core';
import { EMPTY_SHOP, PAPER_WIDTHS, type PaperWidth, type ReceiptShop } from '@rayrecords/shared';

export const PRINT_SETTINGS_KEY = 'rayrecords.print';

/** What a printer of this device needs. It is kept in the browser: the printer is the device's. */
export interface PrintSettings {
  shop: ReceiptShop;
  width: PaperWidth;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  shop: EMPTY_SHOP,
  width: 80,
};

/** A saved value read back as it is: anything unexpected falls to the default of its field. */
export function parsePrintSettings(raw: string | null): PrintSettings {
  if (!raw) return DEFAULT_PRINT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const shop = (value['shop'] ?? {}) as Partial<Record<string, unknown>>;
    const text = (field: unknown) => (typeof field === 'string' ? field : '');
    const width = PAPER_WIDTHS.find((option) => option === value['width']);
    return {
      shop: {
        logo: text(shop['logo']),
        name: text(shop['name']),
        address: text(shop['address']),
        taxId: text(shop['taxId']),
        footer: text(shop['footer']),
      },
      width: width ?? DEFAULT_PRINT_SETTINGS.width,
    };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

/** The printing settings of this device, saved in `localStorage` each time they change. */
@Injectable({ providedIn: 'root' })
export class PrintSettingsStore {
  readonly settings = signal<PrintSettings>(read());

  save(settings: PrintSettings): void {
    this.settings.set(settings);
    try {
      localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Blocked storage: the settings last until the page is closed.
    }
  }
}

function read(): PrintSettings {
  try {
    return parsePrintSettings(localStorage.getItem(PRINT_SETTINGS_KEY));
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}
