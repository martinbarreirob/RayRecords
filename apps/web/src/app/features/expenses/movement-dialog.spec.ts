import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Category, Transaction } from '@rayrecords/shared';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../core/api/api-client';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { MovementDialog } from './movement-dialog';
import type { MovementRow } from './movements-logic';

const categories: Category[] = [
  { key: 'hogar', name: 'Hogar', icon: 'home', color: '#fdecc8', iconColor: '#b45309' },
  { key: 'ocio', name: 'Ocio', icon: 'movie', color: '#fde2e8', iconColor: '#be123c' },
];

const row: MovementRow = {
  id: 'b'.repeat(24),
  accountId: 'a'.repeat(24),
  date: '2026-11-16',
  month: '2026-11',
  amountCents: -9366,
  description: 'COMPRA TARJ. DIA 2841 MADRID',
  category: 'hogar',
  categorySource: 'rule',
  categoryName: 'Hogar',
  categoryLook: categories[0]!,
};

describe('MovementDialog', () => {
  // The select overlay asks the window for media queries, which jsdom does not implement.
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function setup(movement: MovementRow | null = row, save?: () => unknown) {
    const api = {
      setCategory: vi.fn(
        (_id: string, input: { category: string | null }) =>
          (save?.() ?? of({ ...row, category: input.category, categorySource: 'manual' })) as never,
      ),
    };
    TestBed.configureTestingModule({
      providers: [providePrimeNgTheme(), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(MovementDialog);
    fixture.componentRef.setInput('categories', categories);
    fixture.componentRef.setInput('accountName', 'Cuenta corriente');
    fixture.componentRef.setInput('movement', movement);
    // The draft starts in an effect, so the dialog needs a second pass to show it.
    fixture.detectChanges();
    fixture.detectChanges();
    const saved = vi.fn<(tx: Transaction) => void>();
    const closed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.closed.subscribe(closed);
    return { fixture, api, saved, closed };
  }

  // The dialog is attached to the body, and the ones of earlier tests may still be there.
  const dialog = () => [...document.querySelectorAll<HTMLElement>('.movement-dialog')].at(-1)!;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (label: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.trim() === label,
    )!;

  async function pick(fixture: ComponentFixture<MovementDialog>, label: string): Promise<void> {
    dialog().querySelector<HTMLElement>('.p-select')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const option = [...document.querySelectorAll<HTMLElement>('.p-select-option')].find((node) =>
      text(node).includes(label),
    )!;
    option.click();
    fixture.detectChanges();
  }

  it('shows the data of the movement as the bank gave it', () => {
    setup();
    const facts = text(dialog().querySelector('.facts'));
    expect(facts).toContain('lunes, 16 de noviembre de 2026');
    expect(facts).toContain('93,66');
    expect(facts).toContain('COMPRA TARJ. DIA 2841 MADRID');
    expect(facts).toContain('Cuenta corriente');
  });

  it('shows the category it has now, with its badge', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const chosen = dialog().querySelector('.p-select-label')!;
    expect(text(chosen)).toBe('Hogar');
    expect(chosen.querySelector('app-category-badge')).not.toBeNull();
  });

  it('has no hint about rules and manual choices', () => {
    setup();
    expect(text(dialog())).not.toContain('reglas');
    expect(dialog().querySelector('.hint')).toBeNull();
  });

  it('cannot save until the category changes', () => {
    setup();
    expect(button('Guardar').disabled).toBe(true);
  });

  it('draws every entry of the dropdown with its badge, including "Sin categoría"', async () => {
    const { fixture } = setup();
    dialog().querySelector<HTMLElement>('.p-select')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const options = [...document.querySelectorAll('.p-select-option')];
    expect(options.map((node) => text(node))).toEqual(['Sin categoría', 'Hogar', 'Ocio']);
    for (const option of options) expect(option.querySelector('app-category-badge')).not.toBeNull();
  });

  it('saves the new category as a manual one, without creating a rule', async () => {
    const { fixture, api, saved } = setup();
    await pick(fixture, 'Ocio');
    expect(button('Guardar').disabled).toBe(false);

    button('Guardar').click();
    fixture.detectChanges();
    expect(api.setCategory).toHaveBeenCalledWith(row.id, { category: 'ocio', createRule: false });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0]).toMatchObject({ category: 'ocio', categorySource: 'manual' });
  });

  it('can take the category away', async () => {
    const { fixture, api } = setup();
    await pick(fixture, 'Sin categoría');
    button('Guardar').click();
    expect(api.setCategory).toHaveBeenCalledWith(row.id, { category: null, createRule: false });
  });

  it('shows the error and keeps the dialog open when saving fails', async () => {
    const { fixture, saved } = setup(row, () => throwError(() => new Error('sin conexión')));
    await pick(fixture, 'Ocio');
    button('Guardar').click();
    fixture.detectChanges();
    expect(dialog().querySelector('.alert[role="alert"]')).not.toBeNull();
    expect(saved).not.toHaveBeenCalled();
    expect(button('Guardar').disabled).toBe(false);
  });

  it('closes with Cancelar without saving', () => {
    const { api, closed } = setup();
    button('Cancelar').click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(api.setCategory).not.toHaveBeenCalled();
  });
});
