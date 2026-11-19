import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ConfirmationService, type Confirmation } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import {
  CategoriesDialog,
  type CategoryChanges,
  type CategoryOps,
  type CategoryTexts,
  type ManagedCategory,
} from './categories-dialog';
import { ICON_LABELS, searchIcons } from './category-icons';

const bags: ManagedCategory = {
  id: 'a'.repeat(24),
  name: 'Bolsos',
  icon: 'shopping-bag',
  color: '#e8effc',
  iconColor: '#1d4fb8',
};
const clothes: ManagedCategory = {
  id: 'b'.repeat(24),
  name: 'Ropa',
  icon: 'shirt',
  color: '#d9f2ee',
  iconColor: '#0f766e',
};

describe('searchIcons', () => {
  it('returns every icon for an empty search', () => {
    expect(searchIcons('  ')).toHaveLength(Object.keys(ICON_LABELS).length);
  });

  it('finds icons by their Spanish name, ignoring accents and case', () => {
    expect(searchIcons('BOLSO')).toEqual(['shopping-bag']);
    expect(searchIcons('calcetin')).toEqual(['sock']);
    expect(searchIcons('gafas')).toEqual(['sunglasses', 'eyeglass']);
    expect(searchIcons('xyz')).toEqual([]);
  });
});

describe('CategoriesDialog', () => {
  function setup(categories: ManagedCategory[] = [bags, clothes]) {
    const ops = {
      create: vi.fn((input: Omit<ManagedCategory, 'id'>) =>
        of({ ...bags, id: 'c'.repeat(24), ...input } as ManagedCategory),
      ),
      update: vi.fn((_id: string, changes: CategoryChanges) => of({ ...bags, ...changes })),
      remove: vi.fn((_id: string) => of(undefined)),
    } satisfies CategoryOps;
    const texts: CategoryTexts = {
      count: (n) => (n === 0 ? 'sin productos' : n === 1 ? '1 producto' : `${n} productos`),
      deleteEffect: (n) => `Sus ${n} productos se quedarán sin categoría.`,
    };
    TestBed.configureTestingModule({ providers: [providePrimeNgTheme(), ConfirmationService] });
    const fixture = TestBed.createComponent(CategoriesDialog);
    fixture.componentRef.setInput('categories', categories);
    fixture.componentRef.setInput('counts', new Map([[bags.id, 3]]));
    fixture.componentRef.setInput('ops', ops);
    fixture.componentRef.setInput('texts', texts);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    return { fixture, ops, changed };
  }

  // The dialog is attached to the document body, outside the fixture, and the ones of earlier
  // tests may still be there: the last one is this test's.
  const dialog = () => [...document.querySelectorAll<HTMLElement>('.categories-dialog')].at(-1)!;
  const button = (label: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
      (node) =>
        node.getAttribute('aria-label') === label || node.textContent?.trim().startsWith(label),
    )!;
  const nameField = () => dialog().querySelector<HTMLInputElement>('#category-name')!;
  const rowNames = () =>
    [...dialog().querySelectorAll('.list .name')].map((node) => node.textContent?.trim());

  function type(fixture: ComponentFixture<CategoriesDialog>, name: string): void {
    nameField().value = name;
    nameField().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // The first test of the file compiles the dialog and its icons: under load that can take longer
  // than the default 5 s.
  it(
    'shows the list and, next to it, the editor of the first category',
    { timeout: 20_000 },
    () => {
      setup();
      expect(rowNames()).toEqual(['Bolsos', 'Ropa']);
      expect(dialog().querySelector('.list .count')?.textContent?.trim()).toBe('3 productos');
      expect(dialog().querySelector('.list li.selected .name')?.textContent?.trim()).toBe('Bolsos');
      expect(nameField().value).toBe('Bolsos');
      expect(button('Icono Bolso, bolsa').getAttribute('aria-pressed')).toBe('true');
      expect(dialog().querySelector('.hint')?.textContent).toContain('se guardan solos');
    },
  );

  it('keeps the color pairs and the own-colors button on a single row of eleven', () => {
    setup();
    const row = dialog().querySelector<HTMLElement>('.pairs')!;
    expect(row.querySelectorAll('button')).toHaveLength(11);
    expect(row.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
      'Combinación 3',
    );
    expect(dialog().querySelector<HTMLElement>('#category-custom-colors')!.hidden).toBe(true);
  });

  it('saves an icon or a color pair of an existing category at once', () => {
    const { fixture, ops, changed } = setup();
    button('Icono Regalo').click();
    fixture.detectChanges();
    expect(ops.update).toHaveBeenLastCalledWith(bags.id, { icon: 'gift' });
    // The list shows it without waiting for the reload.
    expect(dialog().querySelector('.list li.selected app-category-badge path')).not.toBeNull();

    button('Combinación 8').click();
    fixture.detectChanges();
    expect(ops.update).toHaveBeenLastCalledWith(bags.id, {
      color: '#fde2e8',
      iconColor: '#be123c',
    });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('renames from the row button and saves when the field is left', () => {
    const { fixture, ops } = setup();
    button('Renombrar la categoría Ropa').click();
    fixture.detectChanges();
    expect(nameField().value).toBe('Ropa');

    type(fixture, '  Moda ');
    expect(rowNames()).toEqual(['Bolsos', 'Moda']);
    expect(ops.update).not.toHaveBeenCalled();
    nameField().dispatchEvent(new Event('blur'));
    expect(ops.update).toHaveBeenCalledWith(clothes.id, { name: 'Moda' });
  });

  it('puts the saved name back when the field is left empty', () => {
    const { fixture, ops } = setup();
    type(fixture, '   ');
    nameField().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(nameField().value).toBe('Bolsos');
    expect(ops.update).not.toHaveBeenCalled();
  });

  it('creates a category only with its button, with the chosen look', () => {
    const { fixture, ops, changed } = setup();
    button('Nueva categoría').click();
    fixture.detectChanges();
    expect(nameField().value).toBe('');
    expect(button('Crear categoría').disabled).toBe(true);

    type(fixture, ' Joyería ');
    button('Icono Diamante, joya').click();
    button('Combinación 9').click();
    fixture.detectChanges();
    expect(ops.create).not.toHaveBeenCalled();
    expect(ops.update).not.toHaveBeenCalled();

    button('Crear categoría').click();
    fixture.detectChanges();
    expect(ops.create).toHaveBeenCalledWith({
      name: 'Joyería',
      icon: 'diamond',
      color: '#f6e1f9',
      iconColor: '#a21caf',
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(dialog().querySelector('.hint')).not.toBeNull();
  });

  it('cancels a new category and goes back to the first one', () => {
    const { fixture, ops } = setup();
    button('Nueva categoría').click();
    fixture.detectChanges();
    button('Cancelar').click();
    fixture.detectChanges();
    expect(nameField().value).toBe('Bolsos');
    expect(ops.create).not.toHaveBeenCalled();
  });

  it('starts on a new category when there are none', () => {
    setup([]);
    expect(dialog().querySelector('.list')).toBeNull();
    expect(button('Crear categoría')).toBeDefined();
    expect(button('Cancelar')).toBeUndefined();
  });

  it('filters the icons with the search box', () => {
    const { fixture } = setup();
    const search = dialog().querySelector<HTMLInputElement>('#category-icon-search')!;
    search.value = 'reloj';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dialog().querySelectorAll('.icon-choice')).toHaveLength(1);

    search.value = 'xyz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dialog().querySelector('.no-icons')).not.toBeNull();
  });

  it('deletes after confirming and says how many products it affects', () => {
    const { fixture, ops, changed } = setup();
    let asked: Confirmation | undefined;
    vi.spyOn(TestBed.inject(ConfirmationService), 'confirm').mockImplementation((confirmation) => {
      asked = confirmation;
      return TestBed.inject(ConfirmationService);
    });
    button('Eliminar la categoría Bolsos').click();
    expect(asked?.message).toContain('Sus 3 productos se quedarán sin categoría');
    expect(ops.remove).not.toHaveBeenCalled();

    asked?.accept?.();
    fixture.detectChanges();
    expect(ops.remove).toHaveBeenCalledWith(bags.id);
    expect(changed).toHaveBeenCalledTimes(1);
    // The editor moves on to the next category.
    expect(nameField().value).toBe('Ropa');
  });

  it('shows the error when a change cannot be saved', () => {
    const { fixture, ops } = setup();
    ops.update.mockReturnValueOnce(throwError(() => new Error('sin conexión')));
    button('Icono Regalo').click();
    fixture.detectChanges();
    expect(dialog().querySelector('.alert[role="alert"]')).not.toBeNull();
  });
});
