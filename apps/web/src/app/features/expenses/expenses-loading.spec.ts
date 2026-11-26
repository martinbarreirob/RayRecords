import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CategorizationRule, ImportBatch, TransactionPage } from '@rayrecords/shared';
import { Subject, of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ImportPanel } from './import-panel';
import { MovementsPanel } from './movements-panel';
import { RulesPanel } from './rules-panel';
import { ConfirmationService } from 'primeng/api';

/** Loading is not the same as empty: the skeleton shows while data arrives and the empty state only after. */
describe('Expenses: loading states', () => {
  const baseApi = {
    accounts: () => of([]),
    categories: () => of([]),
    reviewQueue: () => of({ groups: [], usage: [], pendingTransactions: 0, pendingGroups: 0 }),
  };

  function mount<T>(component: new () => T, api: object): ComponentFixture<T> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ConfirmationService,
        { provide: ApiClient, useValue: { ...baseApi, ...api } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (fixture: ComponentFixture<unknown>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';
  const q = (fixture: ComponentFixture<unknown>, selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector);

  describe('Movements', () => {
    it('shows ghost rows, balance and chips, without the empty text or a zero total', async () => {
      const page = new Subject<TransactionPage>();
      const fixture = mount(MovementsPanel, { transactions: () => page });
      await settle(fixture);

      expect(q(fixture, 'tr.mv-row.skel-in').length).toBeGreaterThanOrEqual(6);
      // The totals card and the category list show their ghosts, not zeros.
      expect(q(fixture, '.figures .skel-in').length).toBe(1);
      expect(q(fixture, '.fig-value').length).toBe(0);
      expect(q(fixture, '.sections.skel-in').length).toBe(1);
      expect(q(fixture, '.sections [aria-pressed]').length).toBe(0);
      expect(text(fixture)).toContain('Cargando movimientos');
      expect(text(fixture)).not.toContain('Sin movimientos en este periodo');
      expect(q(fixture, '.table-card[aria-busy="true"]').length).toBe(1);
    });

    it('with no movements after loading, the skeleton goes away and the empty state shows', async () => {
      const page = new Subject<TransactionPage>();
      const fixture = mount(MovementsPanel, { transactions: () => page });
      await settle(fixture);

      page.next({ items: [], total: 0, limit: 500, offset: 0 } as TransactionPage);
      page.complete();
      await settle(fixture);

      expect(q(fixture, '.skel-in').length).toBe(0);
      expect(text(fixture)).toContain('Sin movimientos en este periodo');
      expect(text(fixture)).not.toContain('Cargando movimientos');
      expect(q(fixture, '.fig-balance .fig-value').length).toBe(1);
    });
  });

  describe('Rules', () => {
    it('does not say there are no rules until they have loaded', async () => {
      const rules = new Subject<CategorizationRule[]>();
      const fixture = mount(RulesPanel, { rules: () => rules });
      await settle(fixture);

      expect(q(fixture, '.rules.skel-in').length).toBe(1);
      expect(text(fixture)).not.toContain('Todavía no hay reglas');

      rules.next([]);
      rules.complete();
      await settle(fixture);

      expect(q(fixture, '.rules.skel-in').length).toBe(0);
      expect(text(fixture)).toContain('Todavía no hay reglas');
    });
  });

  describe('Import', () => {
    it('shows the form and history skeletons until they load', async () => {
      const batches = new Subject<ImportBatch[]>();
      const accounts = new Subject<never[]>();
      const fixture = mount(ImportPanel, { imports: () => batches, accounts: () => accounts });
      await settle(fixture);

      expect(q(fixture, '.skel-in').length).toBe(2);
      expect(text(fixture)).not.toContain('Todavía no has importado');

      accounts.next([]);
      accounts.complete();
      batches.next([]);
      batches.complete();
      await settle(fixture);

      expect(q(fixture, '.skel-in').length).toBe(0);
      expect(text(fixture)).toContain('Todavía no has importado');
    });
  });
});
