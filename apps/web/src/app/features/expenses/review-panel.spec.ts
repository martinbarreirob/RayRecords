import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '../../core/api/api-client';
import { ExpensesSkeleton } from './expenses-skeleton';
import { ReviewPanel } from './review-panel';

function setup(queue: unknown): ComponentFixture<ReviewPanel> {
  const api = new Proxy(
    { reviewQueue: () => (queue === null ? NEVER : of(queue)) } as Record<string, unknown>,
    { get: (target, name: string) => target[name] ?? (() => NEVER) },
  );
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
  });
  const fixture = TestBed.createComponent(ReviewPanel);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

describe('ReviewPanel header', () => {
  it('shows only the title and the done card when nothing is pending', () => {
    const root = el(setup({ groups: [], pendingTransactions: 0, pendingGroups: 0, usage: [] }));
    expect(root.querySelector('#rv-title')?.textContent).toContain('Revisar movimientos');
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    expect(root.textContent).not.toContain('comercio');
    expect(root.querySelector('.empty')?.textContent).toContain('Todo revisado');
  });

  it('keeps the subtitle and the progress bar while loading', () => {
    const root = el(setup(null));
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('keeps the subtitle and the progress bar while there is something to review', () => {
    const group = {
      key: 'k',
      ids: ['1'.repeat(24)],
      count: 1,
      totalCents: -500,
      firstDate: '2026-01-01',
      lastDate: '2026-01-01',
      sampleDescription: 'CAFE',
      recentCents: [-500],
      suggestions: [],
    };
    const root = el(
      setup({ groups: [group], pendingTransactions: 1, pendingGroups: 1, usage: [] }),
    );
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(root.textContent).toContain('comercio');
  });
});

describe('Review skeleton', () => {
  it('draws the same blocks as the real card', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(ExpensesSkeleton);
    fixture.componentRef.setInput('view', 'review');
    fixture.detectChanges();
    const root = el(fixture);
    for (const selector of [
      '.review > .review-head .progress',
      '.review > .review-card .amount',
      '.review-card .merchant',
      '.review-card .chips',
      '.review-card .search',
      '.review-card .review-actions',
    ]) {
      expect(root.querySelector(selector), selector).not.toBeNull();
    }
    expect(root.querySelectorAll('.chips .skeleton').length).toBeGreaterThanOrEqual(4);
  });
});
