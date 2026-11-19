import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT_SETTINGS,
  PRINT_SETTINGS_KEY,
  PrintSettingsStore,
  parsePrintSettings,
} from './print-settings';

describe('parsePrintSettings', () => {
  it('falls back to the defaults for nothing or for garbage', () => {
    expect(parsePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings('{not json')).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it('keeps what is valid and defaults each field that is not', () => {
    const settings = parsePrintSettings(
      JSON.stringify({ shop: { name: 'Tienda', address: 7 }, width: 70 }),
    );
    expect(settings.shop).toEqual({ logo: '', name: 'Tienda', address: '', taxId: '', footer: '' });
    expect(settings.width).toBe(80);
  });

  it('accepts the two roll widths', () => {
    expect(parsePrintSettings(JSON.stringify({ width: 58 })).width).toBe(58);
    expect(parsePrintSettings(JSON.stringify({ width: 80 })).width).toBe(80);
  });
});

describe('PrintSettingsStore', () => {
  beforeEach(() => localStorage.clear());

  it('saves in the browser and starts from it next time', () => {
    const settings = {
      shop: { logo: '', name: 'Tienda', address: '', taxId: '', footer: 'Gracias' },
      width: 58 as const,
    };
    TestBed.inject(PrintSettingsStore).save(settings);
    expect(JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY)!)).toEqual(settings);

    TestBed.resetTestingModule();
    expect(TestBed.inject(PrintSettingsStore).settings()).toEqual(settings);
  });
});
