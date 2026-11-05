import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NoteBoard, NoteCard } from '@rayrecords/shared';
import { Subject } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { NotesPage } from './notes-page';

const stamp = '2026-11-04T09:00:00.000Z';

function card(n: number): NoteCard {
  return {
    id: n.toString(16).padStart(24, '0'),
    text: `nota ${n}`,
    x: 20 * n,
    y: 20 * n,
    w: 280,
    z: n,
    groupId: null,
    doneAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('NotesPage', () => {
  let board$: Subject<NoteBoard>;
  let mobile: boolean;
  const originalMatchMedia = window.matchMedia;

  function render(): { fixture: ComponentFixture<NotesPage>; el: HTMLElement } {
    window.matchMedia = ((query: string) => ({
      matches: mobile && query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const api = {
      noteBoard: () => board$,
      doneNoteCards: () => new Subject(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(NotesPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    board$ = new Subject<NoteBoard>();
    mobile = false;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const buttons = (el: HTMLElement) =>
    [...el.querySelectorAll('header .page-actions button')].map((b) =>
      (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  describe('loading skeleton', () => {
    it('on desktop, while loading, shows the skeleton inside the canvas and not the empty state', () => {
      const { el } = render();

      const skeleton = el.querySelector('.board.loading app-notes-skeleton');
      expect(skeleton).not.toBeNull();
      expect(skeleton?.querySelectorAll('.ghost-card').length).toBeGreaterThanOrEqual(3);
      expect(skeleton?.querySelectorAll('.ghost-group').length).toBe(1);
      expect(skeleton?.querySelector('[role="status"]')?.textContent).toContain('Cargando notas');
      expect(skeleton?.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(el.querySelector('.board.loading')?.getAttribute('aria-busy')).toBe('true');
      expect(el.textContent).not.toContain('Un folio en blanco');
    });

    it('on mobile, while loading, shows ghost rows (5 or 6) and not the empty state', () => {
      mobile = true;
      const { el } = render();

      const skeleton = el.querySelector('app-notes-skeleton');
      const rows = skeleton?.querySelectorAll('.ghost-row').length ?? 0;
      expect(rows).toBeGreaterThanOrEqual(5);
      expect(rows).toBeLessThanOrEqual(6);
      expect(skeleton?.querySelector('[role="status"]')).not.toBeNull();
      expect(el.querySelector('.board')).toBeNull();
      expect(el.textContent).not.toContain('Un folio en blanco');
    });

    it('when data arrives the skeleton disappears and the cards appear', () => {
      const { fixture, el } = render();

      board$.next({ cards: [card(1), card(2)], groups: [] });
      fixture.detectChanges();

      expect(el.querySelector('app-notes-skeleton')).toBeNull();
      expect(el.querySelectorAll('app-note-card').length).toBe(2);
      expect(el.textContent).not.toContain('Un folio en blanco');
    });

    it('the empty state only shows after loading a canvas with no notes', () => {
      const { fixture, el } = render();
      expect(el.textContent).not.toContain('Un folio en blanco');

      board$.next({ cards: [], groups: [] });
      fixture.detectChanges();

      expect(el.querySelector('app-notes-skeleton')).toBeNull();
      expect(el.textContent).toContain('Un folio en blanco');
    });
  });

  describe('header', () => {
    it('on desktop: Nueva nota, Ordenar, Terminadas and the lock at the end', () => {
      const { fixture, el } = render();
      board$.next({ cards: [card(1)], groups: [] });
      fixture.detectChanges();

      expect(buttons(el)).toEqual([
        'Nueva nota Alt N',
        'Ordenar notas',
        'Terminadas (0)',
        'Bloquear la disposición',
      ]);
    });

    it('«Ordenar» has visible text next to the icon', () => {
      const { el } = render();

      const arrange = el.querySelector<HTMLElement>('button[aria-label="Ordenar notas"]');
      expect(arrange?.textContent?.trim()).toBe('Ordenar');
      expect(arrange?.querySelector('.pi-th-large')).not.toBeNull();
    });

    it('there are no group or mark-as-done buttons in the header any more', () => {
      const { el } = render();

      const text = el.querySelector('header')?.textContent ?? '';
      expect(text).not.toContain('Agrupar');
      expect(text).not.toContain('Marcar hecha');
      expect(text).not.toContain('Reabrir');
    });

    it('on mobile only «Terminadas» remains', () => {
      mobile = true;
      const { el } = render();

      expect(buttons(el)).toEqual(['Terminadas (0)']);
    });
  });
});
