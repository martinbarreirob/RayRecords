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
  function setup(page: Transaction[] = items) {
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

  it('keeps the table to its six cells in every row and in the footer', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(el(fixture).querySelectorAll('.p-datatable-thead th')).toHaveLength(6);
    for (const row of el(fixture).querySelectorAll('tr.mv-row')) {
      expect(row.querySelectorAll('td')).toHaveLength(6);
    }
    const foot = [...el(fixture).querySelectorAll<HTMLTableCellElement>('tr.mv-foot td')].reduce(
      (sum, td) => sum + td.colSpan,
      0,
    );
    expect(foot).toBe(6);
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

  it('marks a category chosen by hand with a lock instead of a pencil', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const manual = [...el(fixture).querySelectorAll('tr.mv-row')].find((r) =>
      text(r).includes('ALQUILER'),
    )!;
    expect(manual.querySelector('td.c-cat .manual')).not.toBeNull();
    expect(manual.querySelectorAll('td.c-edit app-icon')).toHaveLength(1);
  });
});
