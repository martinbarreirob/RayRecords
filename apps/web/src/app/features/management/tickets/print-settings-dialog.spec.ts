import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRINT_SETTINGS_KEY, PrintSettingsStore } from '../../../core/print/print-settings';
import { providePrimeNgTheme } from '../../../core/theme/provide-primeng';
import { PrintSettingsDialog } from './print-settings-dialog';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

describe('PrintSettingsDialog', () => {
  beforeEach(() => localStorage.clear());

  function setup(saved?: Parameters<PrintSettingsStore['save']>[0]) {
    TestBed.configureTestingModule({ providers: [providePrimeNgTheme()] });
    if (saved) TestBed.inject(PrintSettingsStore).save(saved);
    const fixture = TestBed.createComponent(PrintSettingsDialog);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    return { fixture, closed };
  }

  const dialog = () =>
    [...document.querySelectorAll<HTMLElement>('.print-settings-dialog')].at(-1)!;
  const field = (name: string) =>
    dialog().querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const button = (label: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.trim() === label,
    )!;
  const previewDoc = () => dialog().querySelector<HTMLIFrameElement>('iframe')!.srcdoc;

  function type(fixture: ComponentFixture<PrintSettingsDialog>, name: string, value: string) {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  const shop = {
    logo: LOGO,
    name: 'Tienda Ray',
    address: 'Calle 1',
    taxId: 'B1',
    footer: 'Hasta pronto',
  };

  it('starts from what is saved: title, address, tax id, footer and logo', async () => {
    const { fixture } = setup({ shop, width: 58 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(field('name').value).toBe('Tienda Ray');
    expect(field('address').value).toBe('Calle 1');
    expect(field('taxId').value).toBe('B1');
    expect(field('footer').value).toBe('Hasta pronto');
    expect(dialog().querySelector('.logo-thumb')).not.toBeNull();
    expect(button('58 mm').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a preview of the receipt that follows what is typed', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    type(fixture, 'name', 'Mi tienda');
    type(fixture, 'footer', 'Vuelva pronto');
    expect(previewDoc()).toContain('<h1>Mi tienda</h1>');
    expect(previewDoc()).toContain('Vuelva pronto');
  });

  it('saves into the browser and closes', async () => {
    const { fixture, closed } = setup();
    await fixture.whenStable();
    type(fixture, 'name', 'Mi tienda');
    button('80 mm').click();
    button('Guardar').click();
    fixture.detectChanges();

    expect(JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY)!)).toMatchObject({
      shop: { name: 'Mi tienda' },
      width: 80,
    });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('removes the logo', async () => {
    const { fixture } = setup({ shop, width: 80 });
    await fixture.whenStable();
    fixture.detectChanges();
    button('Quitar logo').click();
    fixture.detectChanges();
    expect(dialog().querySelector('.logo-thumb')).toBeNull();
    expect(previewDoc()).not.toContain('<img');
  });

  it('does not save when cancelled', async () => {
    const { fixture, closed } = setup();
    await fixture.whenStable();
    type(fixture, 'name', 'Otro');
    button('Cancelar').click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PRINT_SETTINGS_KEY)).toBeNull();
  });
});
