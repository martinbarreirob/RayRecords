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

describe('CalendarPage: form date and editing', () => {
  const event = {
    id: 'b'.repeat(24),
    title: 'Cena',
    dueDate: today,
    time: '21:00',
    kind: 'event',
  } as CalendarEntry;
  const updated: { id: string; input: unknown }[] = [];

  function setup(): ComponentFixture<CalendarPage> {
    updated.length = 0;
    const api = {
      lists: () => of([]),
      calendar: () => of([event]),
      createEvent: () => of({}),
      updateEvent: (id: string, input: unknown) => {
        updated.push({ id, input });
        return of({});
      },
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<CalendarPage>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const dateInput = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>('form.add #cal-date')!;

  it('the new-event date follows the selected day until the user edits it', async () => {
    const fixture = setup();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const days = root.querySelectorAll<HTMLButtonElement>('button.day[data-date]');
    const other = [...days].find((d) => d.dataset['date'] !== today)!;

    root.querySelector<HTMLButtonElement>('app-add-button button')!.click();
    await settle(fixture);
    const component = fixture.componentInstance as unknown as { newDate: () => string };
    expect(component.newDate()).toBe(today);

    other.click();
    await settle(fixture);
    expect(component.newDate()).toBe(other.dataset['date']);

    (fixture.componentInstance as unknown as { onDateEdited(d: string): void }).onDateEdited(
      '2030-01-01',
    );
    days[0]!.click();
    await settle(fixture);
    expect(component.newDate()).toBe('2030-01-01');
    expect(dateInput(root)).not.toBeNull();
  });

  it('edits an event in a dialog and saves through updateEvent', async () => {
    const fixture = setup();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('button[aria-label="Opciones: Cena"]')!.click();
    await settle(fixture);
    const edit = [...document.querySelectorAll<HTMLElement>('.p-menu-item-link')].find(
      (link) => link.textContent?.trim() === 'Editar',
    )!;
    edit.click();
    await settle(fixture);
    // The inline creation form is not involved; the dialog opens with the event's data.
    expect(root.querySelector('form.add')).toBeNull();
    const title = document.querySelector<HTMLInputElement>('#event-form input[name="title"]')!;
    expect(title.value).toBe('Cena');

    title.value = 'Cena con Ana';
    title.dispatchEvent(new Event('input'));
    document.querySelector<HTMLFormElement>('#event-form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(updated).toEqual([
      { id: event.id, input: { title: 'Cena con Ana', date: today, time: '21:00' } },
    ]);
    expect(document.querySelector('#event-form')).toBeNull();
  });

  it('clicking the event body also opens the editor', async () => {
    const fixture = setup();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLElement>('.day-panel .row-entry .body')!.click();
    await settle(fixture);
    expect(document.querySelector('#event-form')).not.toBeNull();
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

  /** Opens the month selector and presses one of its shortcuts. */
  const preset = (fixture: ComponentFixture<CalendarPage>, label: string) => {
    el(fixture).querySelector<HTMLButtonElement>('.pp-trigger')!.click();
    fixture.detectChanges();
    [...el(fixture).querySelectorAll<HTMLButtonElement>('.pp-preset')]
      .find((button) => button.textContent?.trim() === label)!
      .click();
  };

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

    preset(fixture, 'Mes siguiente');
    await settle(fixture);
    expect(requests.length).toBe(2);
    expect(ghostCells(fixture)).toBeGreaterThanOrEqual(35);

    await respond(fixture, 1, []);
    expect(ghostCells(fixture)).toBe(0);

    preset(fixture, 'Este mes');
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

describe('CalendarPage: overdue events with a long title', () => {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const overdue = {
    id: 'c'.repeat(24),
    title: 'Renovar el seguro del coche antes de que termine el plazo de la póliza actual'.repeat(
      2,
    ),
    dueDate: yesterday,
    time: '09:30',
    kind: 'event',
  } as CalendarEntry;

  async function open(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: { lists: () => of([]), calendar: () => of([overdue]) } },
      ],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    const page = fixture.componentInstance as unknown as {
      month: { set(value: string): void };
      selected: { set(value: string): void };
    };
    page.month.set(yesterday.slice(0, 7));
    page.selected.set(yesterday);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows "Vencida" where the time goes, and keeps the options button in the row', async () => {
    const root = await open();
    const row = root.querySelector('.day-panel .row-entry')!;
    expect(row.querySelector('.line .badge')).toBeNull();
    expect(row.querySelector('.sub .badge')?.textContent?.trim()).toBe('Vencida');
    expect(row.querySelector('.sub .time')).toBeNull();
    const menu = row.querySelector<HTMLElement>('button.row-menu')!;
    expect(menu.getAttribute('aria-label')).toContain('Opciones');
    expect(menu.parentElement).toBe(row);
  });

  it('lets the text of the row be tapped to edit it', async () => {
    const root = await open();
    const body = root.querySelector('.day-panel .row-entry .body')!;
    expect(body.getAttribute('role')).toBe('button');
    expect(body.getAttribute('tabindex')).toBe('0');
  });
});

describe('CalendarPage: editing a list item', () => {
  const list = {
    id: 'd'.repeat(24),
    slug: 'tareas',
    name: 'Tareas',
    fieldDefs: [],
    order: 0,
  } as unknown as import('@rayrecords/shared').List;
  const item = {
    id: 'a'.repeat(24),
    listId: list.id,
    title: 'Llamar al dentista',
    tags: [],
    dueDate: today,
    extra: {},
    order: 0,
    source: 'manual',
  } as unknown as import('@rayrecords/shared').Item;

  it('opens the editor of the list for an item, and removes it only after confirming', async () => {
    const asked: string[] = [];
    const api = {
      lists: () => of([list]),
      calendar: () => of([entry]),
      items: (listId: string) => {
        asked.push(listId);
        return of([item]);
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

    root.querySelector<HTMLElement>('.day-panel .row-entry .body')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(asked).toEqual([list.id]);
    expect(root.querySelector('app-item-dialog')).not.toBeNull();
    expect(root.querySelector('button.row-menu')).not.toBeNull();
  });
});

describe('CalendarPage: view switch and month selector', () => {
  const thisMonth = today.slice(0, 7);
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 7);

  async function open(): Promise<ComponentFixture<CalendarPage>> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: { lists: () => of([]), calendar: () => of([entry]) } },
      ],
    });
    const fixture = TestBed.createComponent(CalendarPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: ComponentFixture<CalendarPage>) => fixture.nativeElement as HTMLElement;
  const page = (fixture: ComponentFixture<CalendarPage>) =>
    fixture.componentInstance as unknown as {
      month(): string;
      selected(): string;
    };

  it('has no arrows or "Hoy" button in the header any more', async () => {
    const fixture = await open();
    expect(root(fixture).querySelector('.page-actions .segmented')).toBeNull();
    expect(root(fixture).querySelector('button[aria-label="Mes siguiente"]')).toBeNull();
    expect(root(fixture).querySelector('.page-actions .btn.today')).toBeNull();
    expect(root(fixture).querySelector('.page-actions app-period-picker')).not.toBeNull();
  });

  it('puts the Mes / Agenda control in the day column, right above the day detail', async () => {
    const fixture = await open();
    const side = root(fixture).querySelector('.month-layout > .side')!;
    const control = side.querySelector('.view-switch')!;
    expect(control.nextElementSibling).toBe(side.querySelector('.day-panel'));
    expect(control.querySelectorAll('button').length).toBe(2);
    expect(control.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the control in the same column in the agenda, and switches back', async () => {
    const fixture = await open();
    root(fixture).querySelectorAll<HTMLButtonElement>('.view-switch button')[1]!.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.agenda')).not.toBeNull();
    expect(root(fixture).querySelector('.day-panel')).toBeNull();
    const control = root(fixture).querySelector('.month-layout > .side > .view-switch')!;
    expect(control.querySelectorAll('button')[1]?.getAttribute('aria-pressed')).toBe('true');

    control.querySelectorAll('button')[0]!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(root(fixture).querySelector('.grid-card')).not.toBeNull();
  });

  it('shows the month as "mes año" and picks another one with a single click', async () => {
    const fixture = await open();
    const trigger = root(fixture).querySelector<HTMLButtonElement>('.pp-trigger')!;
    expect(trigger.textContent).toMatch(/^\s*[a-záéíóú]+ \d{4}\s*$/);

    trigger.click();
    fixture.detectChanges();
    const pop = root(fixture).querySelector('.pp-pop')!;
    expect([...pop.querySelectorAll('.pp-preset')].map((b) => b.textContent?.trim())).toEqual([
      'Este mes',
      'Mes anterior',
      'Mes siguiente',
    ]);
    expect(pop.textContent).not.toContain('Todo el año');
    expect(pop.querySelector('.pp-hint')).toBeNull();

    const months = pop.querySelectorAll<HTMLButtonElement>('.pp-month');
    months[Number(thisMonth.slice(5)) - 1]!.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.pp-pop')).toBeNull();
    expect(page(fixture).month()).toBe(thisMonth);
  });

  it('a month change selects day 1, and "Este mes" brings back today', async () => {
    const fixture = await open();
    const click = (label: string) => {
      root(fixture).querySelector<HTMLButtonElement>('.pp-trigger')!.click();
      fixture.detectChanges();
      [...root(fixture).querySelectorAll<HTMLButtonElement>('.pp-preset')]
        .find((b) => b.textContent?.trim() === label)!
        .click();
      fixture.detectChanges();
    };

    click('Mes siguiente');
    expect(page(fixture).month()).toBe(nextMonth);
    expect(page(fixture).selected()).toBe(`${nextMonth}-01`);

    click('Este mes');
    expect(page(fixture).month()).toBe(thisMonth);
    expect(page(fixture).selected()).toBe(today);
  });
});
