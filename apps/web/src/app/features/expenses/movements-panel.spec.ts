import type { WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  DEFAULT_TIME_ZONE,
  monthOf,
  todayIn,
  type AccountSummary,
  type Category,
  type Transaction,
} from '@rayrecords/shared';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../core/api/api-client';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { MovementsPanel } from './movements-panel';

const MONTH = monthOf(todayIn(DEFAULT_TIME_ZONE));
const ACCOUNT = 'a'.repeat(24);

const look = { icon: 'tag', iconColor: '#2b2b2b' } as const;
const categories: Category[] = [
  { key: 'ocio', name: 'Ocio', color: '#fde2e8', ...look, icon: 'movie' },
  { key: 'hogar', name: 'Hogar', color: '#fdecc8', ...look, icon: 'home' },
  { key: 'salud', name: 'Salud', color: '#d9f2ee', ...look, icon: 'heartbeat' },
];

let n = 0;
const movement = (
  description: string,
  amountCents: number,
  category: string | null,
  categorySource: Transaction['categorySource'] = 'rule',
): Transaction => ({
  id: String(++n).padStart(24, '0'),
  accountId: ACCOUNT,
  date: `${MONTH}-10`,
  month: MONTH,
  amountCents,
  description,
  category,
  categorySource: category === null ? 'none' : categorySource,
});

const items = [
  movement('CINES CALLAO', -2500, 'ocio'),
  movement('ALQUILER', -65000, 'hogar', 'manual'),
  movement('FARMACIA', -2000, 'salud'),
  movement('CAFETERIA', -180, null),
  movement('BIZUM RECIBIDO', 3497, null),
];

describe('MovementsPanel', () => {
  /**
   * Mounts the panel. The panel starts grouped, but most tests are about the plain table, so they
   * start with grouping off; pass `'default'` to get the real starting state.
   */
  function setup(page: Transaction[] = items, grouped: boolean | 'default' = false) {
    const api = {
      accounts: () => of([{ id: ACCOUNT, name: 'Cuenta de prueba' } as AccountSummary]),
      categories: () => of(categories),
      transactions: () => of({ items: page, total: page.length }),
      setCategory: vi.fn((id: string, input: { category: string | null }) =>
        of({
          ...page.find((tx) => tx.id === id)!,
          category: input.category,
          categorySource: 'manual' as const,
        }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), providePrimeNgTheme(), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(MovementsPanel);
    if (grouped !== 'default') {
      (fixture.componentInstance as unknown as { grouped: WritableSignal<boolean> }).grouped.set(
        grouped,
      );
    }
    fixture.detectChanges();
    return { fixture, api };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = (fixture: ComponentFixture<MovementsPanel>) => fixture.nativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('lists the categories from the largest amount to the smallest, "Sin categoría" last', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const names = [...el(fixture).querySelectorAll('.section')].map((section) =>
      text(section.querySelector('.section-name')),
    );
    expect(names).toEqual(['Todas', 'Hogar', 'Ocio', 'Salud', 'Sin categoría']);
  });

  it('gives every category in the list a badge, "Sin categoría" included', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const rows = [...el(fixture).querySelectorAll('.section')].slice(1);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.querySelector('app-category-badge')).not.toBeNull();
  });

  it('puts the period on the left of the top band and the text filter on the right', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const band = el(fixture).querySelector('.topline')!;
    const children = [...band.children].map((child) => child.className.split(' ')[0]);
    expect(children.slice(0, 2)).toEqual(['period', 'search']);
    expect(band.querySelector('.search input')).not.toBeNull();
    // It sits in the column of the movements, not across the whole screen.
    expect(band.closest('.main')).not.toBeNull();
    expect(el(fixture).querySelector('.side .topline')).toBeNull();
  });

  it('closes the categories card with the manager button, after a rule', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const card = el(fixture).querySelector('.cats')!;
    const foot = card.querySelector('.cats-foot')!;
    expect(foot.previousElementSibling).toBe(card.querySelector('.sections'));
    expect(text(foot.querySelector('button'))).toBe('Categorías');
  });

  it('puts the expenses on the left and the income on the right of the balance', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const [expenses, income] = [...el(fixture).querySelectorAll('.balance-split > div')];
    expect(text(expenses)).toContain('Gastos');
    expect(text(income)).toContain('Ingresos');
  });

  it('has no "create rule" option', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(text(el(fixture))).not.toContain('Crear regla');
    expect(text(el(fixture)).toLowerCase()).not.toContain('regla');
  });

  it('draws the category as in stock, badge and name, with no container or arrow', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const cell = el(fixture).querySelector('tr.mv-row td.c-cat')!;
    expect(cell.querySelector('app-category-badge')).not.toBeNull();
    expect(cell.querySelector('p-select, .caret, .p-select')).toBeNull();
    const uncategorized = [...el(fixture).querySelectorAll('tr.mv-row')].find((row) =>
      text(row).includes('CAFETERIA'),
    )!;
    expect(uncategorized.querySelector('td.c-cat app-category-badge')).not.toBeNull();
    expect(text(uncategorized.querySelector('td.c-cat'))).toBe('Sin categoría');
  });

  /** Header cells, cells of every row and the width of the footer must all agree. */
  function expectColumns(fixture: ComponentFixture<MovementsPanel>, columns: number) {
    expect(el(fixture).querySelectorAll('.p-datatable-thead th')).toHaveLength(columns);
    for (const row of el(fixture).querySelectorAll('tr.mv-row')) {
      const cells = [...row.querySelectorAll<HTMLTableCellElement>(':scope > td')];
      expect(cells.reduce((sum, td) => sum + td.colSpan, 0)).toBe(columns);
    }
    const foot = [...el(fixture).querySelectorAll<HTMLTableCellElement>('tr.mv-foot td')].reduce(
      (sum, td) => sum + td.colSpan,
      0,
    );
    expect(foot).toBe(columns);
  }

  const chooseSection = async (fixture: ComponentFixture<MovementsPanel>, name: string) => {
    const button = [...el(fixture).querySelectorAll<HTMLButtonElement>('.section')].find((b) =>
      text(b.querySelector('.section-name')).includes(name),
    )!;
    button.click();
    await settle(fixture);
  };

  const groupToggle = (fixture: ComponentFixture<MovementsPanel>) =>
    el(fixture).querySelector<HTMLButtonElement>('.topline .group-toggle')!;

  it('keeps the table to its six cells in every row and in the footer', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expectColumns(fixture, 6);
  });

  it('drops the category column when a category is chosen on the left', async () => {
    const { fixture } = setup();
    await settle(fixture);
    await chooseSection(fixture, 'Hogar');
    expect(el(fixture).querySelector('.c-cat')).toBeNull();
    expect(text(el(fixture).querySelector('.p-datatable-thead'))).not.toContain('Categoría');
    expectColumns(fixture, 5);

    await chooseSection(fixture, 'Hogar'); // clicking again shows all of them
    expectColumns(fixture, 6);
  });

  it('drops the category column for "Sin categoría" too', async () => {
    const { fixture } = setup();
    await settle(fixture);
    await chooseSection(fixture, 'Sin categoría');
    expect(el(fixture).querySelector('.c-cat')).toBeNull();
    expectColumns(fixture, 5);
  });

  it('draws the empty message as wide as the visible columns', async () => {
    const { fixture } = setup();
    await settle(fixture);
    await chooseSection(fixture, 'Hogar');
    fixture.componentInstance['query'].set('zzz');
    await settle(fixture);
    expect(el(fixture).querySelector<HTMLTableCellElement>('td.empty-cell')!.colSpan).toBe(5);
  });

  it('opens the movement in a dialog from the pencil at the end of its row', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    const row = [...el(fixture).querySelectorAll('tr.mv-row')].find((r) =>
      text(r).includes('CINES CALLAO'),
    )!;
    row.querySelector<HTMLButtonElement>('td.c-edit button')!.click();
    await settle(fixture);

    const dialog = [...document.querySelectorAll<HTMLElement>('.movement-dialog')].at(-1)!;
    expect(text(dialog)).toContain('CINES CALLAO');
    expect(text(dialog)).toContain('Cuenta de prueba');
    expect(api.setCategory).not.toHaveBeenCalled();
  });

  it('does not mark a category chosen by hand', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const manual = [...el(fixture).querySelectorAll('tr.mv-row')].find((r) =>
      text(r).includes('ALQUILER'),
    )!;
    expect(manual.querySelector('.manual, app-icon[name="lock"]')).toBeNull();
    expect(text(manual)).not.toContain('a mano');
    expect(manual.querySelectorAll('td.c-edit app-icon')).toHaveLength(1);
  });

  describe('grouping', () => {
    const repeated = [
      movement('MERCADONA', -2000, 'hogar'),
      movement('Mercadona', -3500, 'hogar'),
      movement('MERCADONA', -1500, 'ocio'),
      movement('CINES CALLAO', -2500, 'ocio'),
      movement('SUELDO', 150000, null),
    ];

    const groupRows = (fixture: ComponentFixture<MovementsPanel>) => [
      ...el(fixture).querySelectorAll('tr.mv-group'),
    ];

    const group = async (fixture: ComponentFixture<MovementsPanel>) => {
      groupToggle(fixture).click();
      await settle(fixture);
    };

    const mercadonaButton = (fixture: ComponentFixture<MovementsPanel>) =>
      groupRows(fixture)
        .find((r) => text(r).includes('MERCADONA'))!
        .querySelector<HTMLButtonElement>('.group-btn')!;

    it('puts a pressed-state toggle next to the filter, and starts grouped', async () => {
      const { fixture } = setup(repeated, 'default');
      await settle(fixture);
      const button = groupToggle(fixture);
      expect(text(button)).toContain('Agrupar');
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(el(fixture).querySelector('.topline .search')!.nextElementSibling).toBe(button);
      expect(groupRows(fixture).length).toBeGreaterThan(0);
      // Switching it off gives the plain table.
      button.click();
      await settle(fixture);
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(groupRows(fixture)).toHaveLength(0);
    });

    it('lists one row per description with its count, total and category', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);

      expect(groupToggle(fixture).getAttribute('aria-pressed')).toBe('true');
      // A place with a single movement stays a plain row: there is nothing to open.
      const rows = groupRows(fixture);
      expect(rows).toHaveLength(1);
      const mercadona = rows.find((r) => text(r).includes('MERCADONA'))!;
      expect(text(mercadona.querySelector('.group-count'))).toBe('3 mov.');
      expect(text(mercadona.querySelector('td.c-amount'))).toContain('70,00');
      expect(text(mercadona.querySelector('td.c-cat'))).toBe('Varias');
      const cines = [...el(fixture).querySelectorAll('tr.mv-row')].find((r) =>
        text(r).includes('CINES'),
      )!;
      expect(cines.classList.contains('mv-group')).toBe(false);
      expect(cines.querySelector('.group-btn')).toBeNull();
      expect(text(cines.querySelector('td.c-cat'))).toBe('Ocio');
      expect(el(fixture).querySelectorAll('tr.mv-child')).toHaveLength(0);
    });

    it('shows a date on every row: the latest one on a group, each one on its movements', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      mercadonaButton(fixture).click();
      await settle(fixture);
      for (const row of el(fixture).querySelectorAll('tr.mv-row')) {
        expect(text(row.querySelector('td.c-date')), text(row)).not.toBe('');
      }
    });

    it('does not repeat the description or the category on the movements of a group', async () => {
      const { fixture } = setup([
        movement('CINES', -1000, 'ocio'),
        movement('Cines', -1200, 'ocio'),
        movement('CINES  ', -900, 'ocio'),
      ]);
      await settle(fixture);
      await group(fixture);
      groupRows(fixture)[0]!.querySelector<HTMLButtonElement>('.group-btn')!.click();
      await settle(fixture);

      const children = [...el(fixture).querySelectorAll('tr.mv-child')];
      expect(children).toHaveLength(3);
      for (const child of children) {
        // The date takes the room of the date and description cells; the category stays empty.
        expect(child.querySelector('td.c-desc')).toBeNull();
        expect(child.querySelector<HTMLTableCellElement>('td.c-child')!.colSpan).toBe(2);
        expect(text(child.querySelector('td.c-cat'))).toBe('');
      }
      // Only a description written differently is shown, next to its date.
      expect(children.filter((c) => c.querySelector('.child-desc'))).toHaveLength(2);
    });

    it('shows the category of each movement when the group mixes them', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      mercadonaButton(fixture).click();
      await settle(fixture);
      const cats = [...el(fixture).querySelectorAll('tr.mv-child td.c-cat')].map((c) => text(c));
      expect(cats.sort()).toEqual(['Hogar', 'Hogar', 'Ocio']);
    });

    it('opens and closes a group to show every amount of that place', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);

      expect(mercadonaButton(fixture).getAttribute('aria-expanded')).toBe('false');
      mercadonaButton(fixture).click();
      await settle(fixture);

      expect(mercadonaButton(fixture).getAttribute('aria-expanded')).toBe('true');
      const children = [...el(fixture).querySelectorAll('tr.mv-child')];
      expect(children).toHaveLength(3);
      const amounts = children.map((c) => text(c.querySelector('td.c-amount')));
      expect(amounts.some((a) => a.includes('15,00'))).toBe(true);
      expect(amounts.some((a) => a.includes('20,00'))).toBe(true);
      expect(amounts.some((a) => a.includes('35,00'))).toBe(true);

      mercadonaButton(fixture).click();
      await settle(fixture);
      expect(el(fixture).querySelectorAll('tr.mv-child')).toHaveLength(0);
    });

    it('keeps selecting and editing on the movements of an open group', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      mercadonaButton(fixture).click();
      await settle(fixture);

      const child = el(fixture).querySelector('tr.mv-child')!;
      child.querySelector<HTMLElement>('.p-checkbox-box, input')!.click();
      await settle(fixture);
      expect(text(el(fixture).querySelector('.bulk-count'))).toContain('1 seleccionada');

      child.querySelector<HTMLButtonElement>('td.c-edit button')!.click();
      await settle(fixture);
      const dialog = [...document.querySelectorAll<HTMLElement>('.movement-dialog')].at(-1)!;
      expect(text(dialog)).toContain('MERCADONA');
    });

    it('applies the filters before grouping', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      fixture.componentInstance['query'].set('mercadona');
      await settle(fixture);
      expect(groupRows(fixture)).toHaveLength(1);
      expect(text(groupRows(fixture)[0])).toContain('MERCADONA');
      expect(el(fixture).querySelectorAll('tr.mv-row:not(.mv-group)')).toHaveLength(0);
    });

    it('hides the category column of groups and of their movements when a category is chosen', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      await chooseSection(fixture, 'Hogar');
      groupRows(fixture)[0]!.querySelector<HTMLButtonElement>('.group-btn')!.click();
      await settle(fixture);

      expect(el(fixture).querySelector('.c-cat')).toBeNull();
      expect(el(fixture).querySelectorAll('tr.mv-child')).toHaveLength(2);
      expectColumns(fixture, 5);
    });

    it('opens a group from anywhere on its row, with the indicator on the left', async () => {
      const { fixture } = setup(repeated, true);
      await settle(fixture);
      const row = groupRows(fixture).find((r) => text(r).includes('MERCADONA'))!;
      expect(row.querySelector('td.c-check .group-btn')).not.toBeNull();

      row.querySelector<HTMLElement>('td.c-amount')!.click();
      await settle(fixture);
      expect(el(fixture).querySelectorAll('tr.mv-child')).toHaveLength(3);
      expect(row.querySelector('.group-btn')!.getAttribute('aria-expanded')).toBe('true');

      // The indicator itself toggles once, not twice (its click also reaches the row).
      row.querySelector<HTMLButtonElement>('.group-btn')!.click();
      await settle(fixture);
      expect(el(fixture).querySelectorAll('tr.mv-child')).toHaveLength(0);
    });

    it('goes back to one row per movement when switched off', async () => {
      const { fixture } = setup(repeated);
      await settle(fixture);
      await group(fixture);
      await group(fixture);
      expect(groupRows(fixture)).toHaveLength(0);
      expect(el(fixture).querySelectorAll('tr.mv-row')).toHaveLength(repeated.length);
    });
  });
});
