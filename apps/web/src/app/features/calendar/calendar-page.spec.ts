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
  kind: 'item',
  listName: 'Tareas',
  listSlug: 'tareas',
} as CalendarEntry;

describe('CalendarPage: adding events', () => {
  it('creates an event without asking for a list, even when there are no lists', async () => {
    const created: unknown[] = [];
    const api = {
      lists: () => of([]),
      calendar: () => of([]),
      createEvent: (input: unknown) => {
        created.push(input);
        return of({});
      },
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('app-add-button button')!.click();
    fixture.detectChanges();

    expect(root.querySelector('form.add')).not.toBeNull();
    expect(root.querySelector('form.add p-select')).toBeNull();
    expect(root.textContent).not.toContain('Aún no hay listas');

    const input = root.querySelector<HTMLInputElement>('form.add input[name="title"]')!;
    input.value = 'Dentista';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const submit = root.querySelector<HTMLButtonElement>('form.add button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    root.querySelector<HTMLFormElement>('form.add')!.dispatchEvent(new Event('submit'));

    expect(created).toEqual([{ title: 'Dentista', date: today }]);
  });
});

describe('CalendarPage: loading', () => {
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

  it('on first load draws the ghost grid and not the empty state', () => {
    const fixture = setup();
    expect(ghostCells(fixture)).toBeGreaterThanOrEqual(35);
    expect(el(fixture).querySelector('.day-panel .rows.skel-in')).not.toBeNull();
    expect(el(fixture).querySelector('.day-panel .empty')).toBeNull();
    expect(el(fixture).querySelectorAll('button.day').length).toBe(0);
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Cargando');
    expect(el(fixture).querySelector('.grid-card')?.getAttribute('aria-busy')).toBe('true');
  });

  it('with data the skeleton goes away and the days and items appear', async () => {
    const fixture = setup();
    await respond(fixture, 0, [entry]);

    expect(ghostCells(fixture)).toBe(0);
    expect(el(fixture).querySelector('.skel-in')).toBeNull();
    expect(el(fixture).querySelectorAll('button.day').length).toBeGreaterThanOrEqual(35);
    expect(el(fixture).querySelector('.day-panel')?.textContent).toContain('Llamar al dentista');
    expect(el(fixture).querySelector('[role="status"]')?.textContent?.trim()).toBe('');
  });

  it('a day without items shows "vacío" only after loading', async () => {
    const fixture = setup();
    expect(el(fixture).querySelector('.day-panel .empty')).toBeNull();
    await respond(fixture, 0, []);
    expect(el(fixture).querySelector('.day-panel .empty')?.textContent).toContain(
      'No hay nada este día',
    );
  });

  it('switching to a month without data brings back the skeleton; going back to a seen one does not', async () => {
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
    // The previous month was already seen: what was there is shown, dimmed while it refreshes.
    expect(ghostCells(fixture)).toBe(0);
    expect(el(fixture).querySelector('.grid-card')?.classList).toContain('is-refreshing');
    expect(el(fixture).querySelector('.day-panel')?.textContent).toContain('Llamar al dentista');
  });

  it('with data already loaded, a reload dims instead of going back to the skeleton', async () => {
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

  it('if loading fails it does not stay on the skeleton: it shows the error', async () => {
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
