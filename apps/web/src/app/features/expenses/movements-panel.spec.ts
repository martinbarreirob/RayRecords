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
   * Mounts the panel as it starts: the plain table, one row per movement. Pass `true` to start
   * grouped by date (a heading per day).
   */
  function setup(page: Transaction[] = items, byDate = false) {
    const api = {
      accounts: () => of([{ id: ACCOUNT, name: 'Cuenta de prueba' } as AccountSummary]),
      categories: () => of(categories),
      transactions: () => of({ items: page, total: page.length }),
      reviewQueue: () => of({ groups: [], usage: [], pendingTransactions: 24, pendingGroups: 5 }),
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
    if (byDate) {
      (fixture.componentInstance as unknown as { byDate: WritableSignal<boolean> }).byDate.set(
        byDate,
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

  it('opens the summary with the count of movements and keeps the counts out of each category', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(text(el(fixture).querySelector('.side-head'))).toBe('Resumen5 movimientos');
    const rows = [...el(fixture).querySelectorAll('.section')];
    // "Todas" is a card like the others: badge, name and amount, no "mov." count.
    expect(rows[0]!.querySelector('app-category-badge')).not.toBeNull();
    for (const row of rows) expect(text(row)).not.toContain('mov');
  });

  it('titles the table with the category chosen and its movements', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const title = () => el(fixture).querySelector<HTMLElement>('.main-title')!;
    expect(title().classList.contains('is-all')).toBe(true);
    [...el(fixture).querySelectorAll<HTMLButtonElement>('.section')]
      .find((row) => text(row).includes('Hogar'))!
      .click();
    await settle(fixture);
    expect(title().classList.contains('is-all')).toBe(false);
    expect(text(title())).toBe('Hogar · 1 movimiento');
  });

  it('ends the categories card with Importar and Reglas, then what is left to review', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const foot = el(fixture).querySelector('.cats .cats-foot')!;
    const [, tools, review] = [...foot.children];
    expect([...tools!.querySelectorAll('button')].map((b) => text(b))).toEqual([
      'Importar',
      'Reglas',
    ]);
    expect(text(review)).toBe('24 sin categoríaRevisar');
  });

  it('gives every category in the list a badge, "Sin categoría" included', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const rows = [...el(fixture).querySelectorAll('.section')].slice(1);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.querySelector('app-category-badge')).not.toBeNull();
  });

  it('puts the period and the group switch on the left of the top band and the text filter after them', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const band = el(fixture).querySelector('.topline')!;
    const children = [...band.children].map((child) => child.className.split(' ')[0]);
    expect(children.slice(0, 3)).toEqual(['period', 'btn', 'search']);
    // The categories are filtered from the summary, not from a dropdown.
    expect(band.querySelector('.cat-filter')).toBeNull();
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
    expect(foot.querySelector('.categories-btn app-icon')).not.toBeNull();
  });

  it('shows the balance, the expenses and the income as the figures above the table', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const figures = el(fixture).querySelector('.figures')!;
    expect(figures.closest('.main')).not.toBeNull();
    expect(text(figures.querySelector('.fig-balance'))).toBe('Balance -661,83 €');
    expect(text(figures.querySelector('.fig-expenses'))).toContain('Gastos');
    expect(text(figures.querySelector('.fig-income'))).toContain('Ingresos');
    expect(el(fixture).querySelector('.side .figures')).toBeNull();
  });

  it('heads each day with its date and what it added up to when grouped by date', async () => {
    const { fixture } = setup(items, true);
    await settle(fixture);
    const days = [...el(fixture).querySelectorAll('tr.day-row')];
    // All the movements are of one day.
    expect(days).toHaveLength(1);
    expect(text(days[0]!.querySelector('.day-name'))).toMatch(/^\p{Lu}\p{L}+ 10 \p{L}+$/u);
    expect(text(days[0]!.querySelector('.day-total'))).toBe('-661,83 €');
    // The heading carries the date: no column for it.
    expect(el(fixture).querySelector('.c-date')).toBeNull();
  });

  it('starts as a plain table: date, description, amount and category, no day headings', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(el(fixture).querySelector('tr.day-row')).toBeNull();
    expect(el(fixture).querySelector('th.c-date')).not.toBeNull();
    expectColumns(fixture, 6);
  });

  it('gives the plain table back when grouped by date but sorted by another column', async () => {
    const { fixture } = setup(items, true);
    await settle(fixture);
    fixture.componentInstance['sortField'].set('amountCents');
    await settle(fixture);
    expect(el(fixture).querySelector('tr.day-row')).toBeNull();
    expect(el(fixture).querySelector('th.c-date')).not.toBeNull();
    expectColumns(fixture, 6);
  });

  it('sorts by the clicked column, whatever the dates of the rows', async () => {
    const days = [
      { ...movement('A', -500, 'hogar'), date: `${MONTH}-03` },
      { ...movement('B', -9000, 'ocio'), date: `${MONTH}-20` },
      { ...movement('C', -100, 'hogar'), date: `${MONTH}-11` },
    ];
    const { fixture } = setup(days);
    await settle(fixture);
    const amounts = () =>
      [...el(fixture).querySelectorAll('tr.mv-row td.c-amount')].map((td) => text(td));
    const header = el(fixture).querySelector<HTMLElement>('th.c-amount')!;
    header.click();
    await settle(fixture);
    expect(amounts()).toEqual(['-90,00 €', '-5,00 €', '-1,00 €']);
    header.click();
    await settle(fixture);
    expect(amounts()).toEqual(['-1,00 €', '-5,00 €', '-90,00 €']);
  });

  it('shows the empty message with its title, reason and button one under the other', async () => {
    const { fixture } = setup();
    await settle(fixture);
    fixture.componentInstance['query'].set('zzz');
    await settle(fixture);
    const stack = el(fixture).querySelector('td.empty-cell .empty-stack')!;
    expect([...stack.children].map((c) => c.tagName)).toEqual(['STRONG', 'BUTTON']);
  });

  it('has no "create rule" option', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(text(el(fixture))).not.toContain('Crear regla');
    // The summary has its own shortcut to the rules view; the movements themselves have none.
    expect(text(el(fixture).querySelector('.main')).toLowerCase()).not.toContain('regla');
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

  it('keeps the table to its six cells in every row and in the footer, five when grouped by date', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expectColumns(fixture, 6);
    groupToggle(fixture).click();
    await settle(fixture);
    expectColumns(fixture, 5);
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

  describe('group by date', () => {
    const twoDays = [
      { ...movement('MERCADONA', -2000, 'hogar'), date: `${MONTH}-10`, month: MONTH },
      { ...movement('CINES CALLAO', -2500, 'ocio'), date: `${MONTH}-10`, month: MONTH },
      { ...movement('SUELDO', 150000, null), date: `${MONTH}-08`, month: MONTH },
    ];

    it('puts a pressed-state toggle next to the period, and starts as a plain table', async () => {
      const { fixture } = setup(twoDays);
      await settle(fixture);
      const button = groupToggle(fixture);
      expect(text(button)).toContain('Agrupar por fecha');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(el(fixture).querySelector('.topline .period')!.nextElementSibling).toBe(button);
      expect(button.nextElementSibling!.classList.contains('search')).toBe(true);
      expect(el(fixture).querySelector('tr.day-row')).toBeNull();
      // Switching it on heads each day, and the date column goes.
      button.click();
      await settle(fixture);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(el(fixture).querySelectorAll('tr.day-row')).toHaveLength(2);
      expect(el(fixture).querySelector('th.c-date')).toBeNull();
    });

    it('goes back to the plain table when switched off', async () => {
      const { fixture } = setup(twoDays);
      await settle(fixture);
      groupToggle(fixture).click();
      await settle(fixture);
      groupToggle(fixture).click();
      await settle(fixture);
      expect(el(fixture).querySelector('tr.day-row')).toBeNull();
      expect(el(fixture).querySelectorAll('tr.mv-row')).toHaveLength(twoDays.length);
    });

    it('sorts by date when switched on after sorting by another column', async () => {
      const { fixture } = setup(twoDays);
      await settle(fixture);
      fixture.componentInstance['sortField'].set('amountCents');
      await settle(fixture);
      groupToggle(fixture).click();
      await settle(fixture);
      expect(el(fixture).querySelectorAll('tr.day-row')).toHaveLength(2);
    });

    it('leaves the headers unsortable while grouped, and sortable again after', async () => {
      const { fixture } = setup(twoDays);
      await settle(fixture);
      const sortIcons = () => el(fixture).querySelectorAll('.p-datatable-thead p-sorticon').length;
      const plain = sortIcons();
      expect(plain).toBeGreaterThan(0);
      groupToggle(fixture).click();
      await settle(fixture);
      expect(sortIcons()).toBe(0);
      groupToggle(fixture).click();
      await settle(fixture);
      expect(sortIcons()).toBe(plain);
    });

    it('hides the category column when a category is chosen, grouped or not', async () => {
      const { fixture } = setup(twoDays, true);
      await settle(fixture);
      await chooseSection(fixture, 'Hogar');
      expect(el(fixture).querySelector('.c-cat')).toBeNull();
      expectColumns(fixture, 4);
    });
  });
});
