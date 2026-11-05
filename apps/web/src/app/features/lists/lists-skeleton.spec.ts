import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Item, List } from '@rayrecords/shared';
import { Subject } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ListDetailPage } from './list-detail-page';
import { ListsPage } from './lists-page';
import { ListsSkeleton, type ListsSkeletonVariant } from './lists-skeleton';

const stamp = '2026-11-04T09:00:00.000Z';

function list(name: string, extra: Partial<List> = {}): List {
  return {
    id: name.padStart(24, '0'),
    name,
    slug: name.toLowerCase(),
    kind: 'free',
    fieldDefs: [],
    order: 1000,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...extra,
  } as List;
}

describe('ListsSkeleton', () => {
  function render(variant: ListsSkeletonVariant) {
    const fixture = TestBed.createComponent(ListsSkeleton);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('message', 'Cargando algo…');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('la rejilla dibuja tarjetas fantasma con título, chips y pie', () => {
    const el = render('grid');

    expect(el.querySelectorAll('.grid-card').length).toBeGreaterThanOrEqual(4);
    expect(el.querySelector('.grid-card .title')).not.toBeNull();
    expect(el.querySelector('.grid-card .chips .pill')).not.toBeNull();
    expect(el.querySelector('.grid-card .foot .btn-ghost')).not.toBeNull();
  });

  it('la tabla dibuja una cabecera y filas con casilla, título, chips y fecha', () => {
    const el = render('table');

    expect(el.querySelectorAll('.trow:not(.head)').length).toBeGreaterThanOrEqual(5);
    expect(el.querySelector('.trow .check')).not.toBeNull();
    expect(el.querySelector('.trow .chips .pill')).not.toBeNull();
  });

  it('el tablero dibuja tres columnas con entre 2 y 4 tarjetas cada una', () => {
    const el = render('board');

    const columns = [...el.querySelectorAll('.column')];
    expect(columns.length).toBe(3);
    for (const column of columns) {
      const cards = column.querySelectorAll('.kcard').length;
      expect(cards).toBeGreaterThanOrEqual(2);
      expect(cards).toBeLessThanOrEqual(4);
    }
  });

  it.each(['grid', 'table', 'board'] as const)(
    'en %s los bloques son decorativos y un aviso de estado lo anuncia',
    (variant) => {
      const el = render(variant);

      expect(el.querySelector('[role="status"]')?.textContent).toBe('Cargando algo…');
      expect(el.querySelector('[role="status"]')?.classList).toContain('sr-only');
      expect(el.querySelector('[aria-hidden="true"] .skeleton')).not.toBeNull();
      // Nada del esqueleto queda expuesto fuera de un contenedor oculto.
      for (const block of el.querySelectorAll('.skeleton')) {
        expect(block.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    },
  );
});

describe('ListsPage: carga', () => {
  let lists$: Subject<List[]>;

  function render() {
    const api = { lists: () => lists$, items: () => new Subject<Item[]>() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(ListsPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    lists$ = new Subject<List[]>();
  });

  it('muestra el esqueleto de la rejilla mientras llegan las listas, sin el vacío', () => {
    const { el } = render();

    expect(el.querySelector('app-lists-skeleton .grid-card')).not.toBeNull();
    expect(el.textContent).not.toContain('Todavía no hay listas');
  });

  it('con datos reemplaza el esqueleto por las tarjetas reales', () => {
    const { fixture, el } = render();

    lists$.next([list('Peliculas'), list('Series')]);
    fixture.detectChanges();

    expect(el.querySelector('app-lists-skeleton')).toBeNull();
    expect(el.querySelectorAll('li.list-card').length).toBe(2);
  });

  it('vacío no es cargando: sin listas se ve el aviso y no el esqueleto', () => {
    const { fixture, el } = render();

    lists$.next([]);
    fixture.detectChanges();

    expect(el.querySelector('app-lists-skeleton')).toBeNull();
    expect(el.textContent).toContain('Todavía no hay listas');
  });
});

describe('ListDetailPage: carga', () => {
  let lists$: Subject<List[]>;
  let items$: Subject<Item[]>;

  function render() {
    const api = { lists: () => lists$, items: () => items$ };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(ListDetailPage);
    fixture.componentRef.setInput('slug', 'peliculas');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    lists$ = new Subject<List[]>();
    items$ = new Subject<Item[]>();
  });

  it('sin saber aún la lista muestra el esqueleto de tabla por defecto', () => {
    const { el } = render();

    expect(el.querySelector('app-lists-skeleton .trow')).not.toBeNull();
    expect(el.querySelector('app-lists-skeleton .board')).toBeNull();
  });

  it('una lista sin tablero espera sus elementos con filas fantasma bajo la cabecera real', () => {
    const { fixture, el } = render();

    lists$.next([list('Peliculas')]);
    fixture.detectChanges();

    expect(el.querySelector('h1')?.textContent).toContain('Peliculas');
    expect(el.querySelector('app-lists-skeleton .trow')).not.toBeNull();
    expect(el.querySelector('app-list-table')).toBeNull();
    expect(el.textContent).not.toContain('Esta lista está vacía');

    items$.next([]);
    fixture.detectChanges();

    expect(el.querySelector('app-lists-skeleton')).toBeNull();
    expect(el.textContent).toContain('Esta lista está vacía');
  });

  it('una lista de tablero espera sus elementos con columnas fantasma', () => {
    const { fixture, el } = render();

    lists$.next([
      list('Peliculas', {
        board: {
          columns: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B' },
          ],
        },
      }),
    ]);
    fixture.detectChanges();

    expect(el.querySelectorAll('app-lists-skeleton .column').length).toBe(3);
    expect(el.querySelector('app-lists-skeleton .trow')).toBeNull();

    items$.next([]);
    fixture.detectChanges();

    expect(el.querySelector('app-lists-skeleton')).toBeNull();
    expect(el.querySelector('app-list-board')).not.toBeNull();
  });
});
