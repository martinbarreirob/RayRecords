import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_TIME_ZONE, todayIn, type CalendarEntry } from '@rayrecords/shared';
import { Subject, of, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { RefreshBus } from '../../core/refresh';
import { CalendarPage } from './calendar-page';

const today = todayIn(DEFAULT_TIME_ZONE);
const entry = {
  id: 'a'.repeat(24),
  title: 'Llamar al dentista',
  dueDate: today,
  listName: 'Tareas',
  listSlug: 'tareas',
} as CalendarEntry;

describe('CalendarPage: carga', () => {
  let requests: { from: string; to: string; subject: Subject<CalendarEntry[]> }[];

  function setup(): ComponentFixture<CalendarPage> {
    requests = [];
    const api = {
      lists: () => of([]),
      calendar: (from: string, to: string) => {
        const subject = new Subject<CalendarEntry[]>();
        requests.push({ from, to, subject });
        return subject;
      },
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<CalendarPage>) => fixture.nativeElement as HTMLElement;
  const ghostCells = (fixture: ComponentFixture<CalendarPage>) =>
    el(fixture).querySelectorAll('tbody.skel-in td').length;

  async function settle(fixture: ComponentFixture<CalendarPage>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respond(
    fixture: ComponentFixture<CalendarPage>,
    index: number,
    entries: CalendarEntry[],
  ): Promise<void> {
    requests[index]!.subject.next(entries);
    requests[index]!.subject.complete();
    await settle(fixture);
  }

  const click = (fixture: ComponentFixture<CalendarPage>, label: string) =>
    el(fixture).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();

  it('en la primera carga pinta la rejilla fantasma y no el estado vacío', () => {
    const fixture = setup();
    expect(ghostCells(fixture)).toBeGreaterThanOrEqual(35);
    expect(el(fixture).querySelector('.day-panel .rows.skel-in')).not.toBeNull();
    expect(el(fixture).querySelector('.day-panel .empty')).toBeNull();
    expect(el(fixture).querySelectorAll('button.day').length).toBe(0);
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
    expect(el(fixture).querySelector('.grid-card')?.getAttribute('aria-busy')).toBe('true');
  });

  it('con los datos desaparece el esqueleto y salen los días y los elementos', async () => {
    const fixture = setup();
    await respond(fixture, 0, [entry]);

    expect(ghostCells(fixture)).toBe(0);
    expect(el(fixture).querySelector('.skel-in')).toBeNull();
    expect(el(fixture).querySelectorAll('button.day').length).toBeGreaterThanOrEqual(35);
    expect(el(fixture).querySelector('.day-panel')?.textContent).toContain('Llamar al dentista');
    expect(el(fixture).querySelector('[role="status"]')?.textContent?.trim()).toBe('');
  });

  it('un día sin elementos muestra «vacío» solo después de cargar', async () => {
    const fixture = setup();
    expect(el(fixture).querySelector('.day-panel .empty')).toBeNull();
    await respond(fixture, 0, []);
    expect(el(fixture).querySelector('.day-panel .empty')?.textContent).toContain(
      'No hay nada este día',
    );
  });

  it('al cambiar a un mes sin datos vuelve el esqueleto; al volver a uno visto, no', async () => {
    const fixture = setup();
    await respond(fixture, 0, [entry]);

    click(fixture, 'Mes siguiente');
    await settle(fixture);
    expect(requests.length).toBe(2);
    expect(ghostCells(fixture)).toBeGreaterThanOrEqual(35);

    await respond(fixture, 1, []);
    expect(ghostCells(fixture)).toBe(0);

    click(fixture, 'Mes anterior');
    await settle(fixture);
    // El mes anterior ya se vio: se enseña lo que había, atenuado mientras se renueva.
    expect(ghostCells(fixture)).toBe(0);
    expect(el(fixture).querySelector('.grid-card')?.classList).toContain('is-refreshing');
    expect(el(fixture).querySelector('.day-panel')?.textContent).toContain('Llamar al dentista');
  });

  it('con datos ya cargados, una recarga atenúa en vez de volver al esqueleto', async () => {
    const fixture = setup();
    await respond(fixture, 0, [entry]);
    TestBed.inject(RefreshBus).changed();
    await settle(fixture);

    expect(requests.length).toBe(2);
    expect(ghostCells(fixture)).toBe(0);
    expect(el(fixture).querySelector('.grid-card')?.classList).toContain('is-refreshing');
    await respond(fixture, 1, [entry]);
    expect(el(fixture).querySelector('.grid-card')?.classList).not.toContain('is-refreshing');
  });

  it('si la carga falla, no se queda en esqueleto: avisa del error', async () => {
    const api = {
      lists: () => of([]),
      calendar: () => throwError(() => new Error('sin red')),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    await settle(fixture);

    expect(el(fixture).querySelector('.skel-in')).toBeNull();
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });
});
