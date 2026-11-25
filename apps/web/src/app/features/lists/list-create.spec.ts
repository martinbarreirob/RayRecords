import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CreateList, List } from '@rayrecords/shared';
import { of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ListCreate } from './list-create';

const stamp = '2026-11-04T09:00:00.000Z';

describe('ListCreate', () => {
  let created: CreateList[];
  let emitted: List[];

  function setup(): ComponentFixture<ListCreate> {
    created = [];
    emitted = [];
    const api = {
      lists: () => of([]),
      createList: (input: CreateList) => {
        created.push(input);
        return of({
          ...input,
          id: 'a'.repeat(24),
          slug: 'nueva',
          order: 1,
          archived: false,
          createdAt: stamp,
          updatedAt: stamp,
        } as unknown as List);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(ListCreate);
    fixture.componentInstance.created.subscribe((list) => emitted.push(list));
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<ListCreate>) => fixture.nativeElement as HTMLElement;

  async function click(fixture: ComponentFixture<ListCreate>, selector: string, index = 0) {
    el(fixture).querySelectorAll<HTMLElement>(selector)[index]!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submit(fixture: ComponentFixture<ListCreate>) {
    el(fixture)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  }

  it('starts with three cards, one under the other: table, kanban and simple list', () => {
    const fixture = setup();
    const cards = [...el(fixture).querySelectorAll('.types .type strong')].map(
      (s) => s.textContent,
    );
    expect(cards).toEqual(['Tabla', 'Kanban', 'Lista simple']);
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('a kanban starts with To do, In progress and Done, each with a colour and a handle', async () => {
    const fixture = setup();
    await click(fixture, '.type', 1);
    const rows = el(fixture).querySelectorAll('.rows .row');
    expect(rows).toHaveLength(3);
    const names = [...rows].map((r) => r.querySelector<HTMLInputElement>('input.name')!.value);
    expect(names).toEqual(['To do', 'In progress', 'Done']);
    for (const row of rows) {
      expect(row.querySelector('.grip')).not.toBeNull();
      // The state icon and the colour are two buttons that open a floating menu.
      expect(row.querySelectorAll('app-column-style .trigger')).toHaveLength(2);
    }
  });

  it('creates the kanban with the chosen colour and the columns in order', async () => {
    const fixture = setup();
    await click(fixture, '.type', 1);
    await click(fixture, '.rows .row:first-child .trigger', 1);
    document.body.querySelectorAll<HTMLElement>('.preset')[3]!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await submit(fixture);
    expect(created).toHaveLength(1);
    expect(created[0]!.kind).toBe('board');
    expect(created[0]!.board!.columns.map((c) => [c.key, c.color])).toEqual([
      ['toDo', 'rose'],
      ['inProgress', 'amber'],
      ['done', 'green'],
    ]);
    expect(emitted).toHaveLength(1);
  });

  it('a table asks for columns, and Opciones shows the options to pick from', async () => {
    const fixture = setup();
    await click(fixture, '.type', 0);
    const rows = el(fixture).querySelectorAll('.rows .row');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.querySelectorAll('.option')).toHaveLength(3);
    expect(rows[0]!.querySelector('.options')).toBeNull();
    // Texto becomes Opciones with two to edit.
    await click(fixture, '.row .kind', 0);
    expect(el(fixture).querySelectorAll('.rows .row')[0]!.querySelectorAll('.option')).toHaveLength(
      2,
    );
  });

  it('a simple list only needs a name', async () => {
    const fixture = setup();
    await click(fixture, '.type', 2);
    expect(el(fixture).querySelector('.rows')).toBeNull();
    await submit(fixture);
    expect(created[0]!.kind).toBe('free');
    expect(created[0]!.fieldDefs).toEqual([]);
  });

  it('goes back from the second step to the first', async () => {
    const fixture = setup();
    await click(fixture, '.type', 0);
    await click(fixture, '.back');
    expect(el(fixture).querySelector('.types')).not.toBeNull();
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('the back button of the first step cancels, and there is no title or bottom Atrás button', async () => {
    const fixture = setup();
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    expect(el(fixture).querySelector('h1')).toBeNull();
    await click(fixture, '.back');
    expect(cancelled).toBe(1);
    await click(fixture, '.type', 2);
    expect(el(fixture).querySelector('.actions')!.textContent).not.toContain('Atrás');
  });
});
