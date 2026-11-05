import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../core/api/api-client';
import { ExpensesPage, VIEW_SWITCH_MS } from './expenses-page';

describe('ExpensesPage', () => {
  // Every call the panels make never answers: they stay in their own loading state.
  const api = new Proxy(
    { reviewPending: () => of({ pendingTransactions: 0 }) } as Record<string, unknown>,
    { get: (target, name: string) => target[name] ?? (() => NEVER) },
  );

  function setup(): ComponentFixture<ExpensesPage> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<ExpensesPage>) => fixture.nativeElement as HTMLElement;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists the views as movements, summary, review, import and rules', () => {
    const labels = [...el(setup()).querySelectorAll('.tabs button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['Movimientos', 'Resumen', 'Revisar', 'Importar', 'Reglas']);
  });

  it('opens on movements, with no placeholder', () => {
    const fixture = setup();
    expect(el(fixture).querySelector('app-movements-panel')).not.toBeNull();
    expect(el(fixture).querySelector('app-expenses-skeleton')).toBeNull();
  });

  it('shows the placeholder for a second when the view changes, then the new view', () => {
    const fixture = setup();

    fixture.componentRef.setInput('vista', 'resumen');
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-expenses-skeleton')).not.toBeNull();
    expect(el(fixture).querySelector('app-summary-panel')).toBeNull();

    vi.advanceTimersByTime(VIEW_SWITCH_MS - 1);
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-expenses-skeleton')).not.toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-expenses-skeleton')).toBeNull();
    expect(el(fixture).querySelector('app-summary-panel')).not.toBeNull();
  });

  it('a second change restarts the wait instead of stacking timers', () => {
    const fixture = setup();

    fixture.componentRef.setInput('vista', 'resumen');
    fixture.detectChanges();
    vi.advanceTimersByTime(VIEW_SWITCH_MS * 0.6);
    fixture.componentRef.setInput('vista', 'reglas');
    fixture.detectChanges();
    vi.advanceTimersByTime(VIEW_SWITCH_MS * 0.6);
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-expenses-skeleton')).not.toBeNull();

    vi.advanceTimersByTime(VIEW_SWITCH_MS * 0.4);
    fixture.detectChanges();
    expect(el(fixture).querySelector('app-rules-panel')).not.toBeNull();
  });
});
