import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Item, List, UpdateList } from '@rayrecords/shared';
import { of, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { moveItem } from './create-logic';
import { ListSettings } from './list-settings';

const stamp = '2026-11-04T09:00:00.000Z';

function base(over: Partial<List>): List {
  return {
    id: 'a'.repeat(24),
    name: 'Mi lista',
    slug: 'mi-lista',
    kind: 'free',
    fieldDefs: [],
    order: 1,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  };
}

const kanban = base({
  kind: 'board',
  board: {
    columns: [
      { key: 'todo', label: 'Por hacer', color: 'blue' },
      { key: 'doing', label: 'En curso', color: 'amber' },
      { key: 'done', label: 'Hecho', color: 'green' },
    ],
  },
});

const table = base({
  fieldDefs: [
    { key: 'nombre', label: 'Nombre', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['A', 'B'] },
    { key: 'precio', label: 'Precio', type: 'money' },
  ],
});

describe('ListSettings', () => {
  let updates: UpdateList[];
  let fail = false;

  function setup(list: List, items: Partial<Item>[] = []): ComponentFixture<ListSettings> {
    updates = [];
    fail = false;
    const api = {
      lists: () => of([list]),
      updateList: (_id: string, input: UpdateList) => {
        if (fail) return throwError(() => new Error('boom'));
        updates.push(input);
        return of({ ...list, ...input } as List);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(ListSettings);
    fixture.componentRef.setInput('list', list);
    fixture.componentRef.setInput('items', items as Item[]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  }

  // The dialog renders in the document body, not inside the fixture.
  const q = (selector: string) => document.querySelector<HTMLElement>(selector)!;
  const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

  async function settle(fixture: ComponentFixture<ListSettings>) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function type(fixture: ComponentFixture<ListSettings>, el: HTMLInputElement, v: string) {
    el.value = v;
    el.dispatchEvent(new Event('input'));
    await settle(fixture);
  }

  async function save(fixture: ComponentFixture<ListSettings>) {
    q('#settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it('a kanban shows its columns with handle, colour circles and no table fields', async () => {
    const fixture = setup(kanban);
    await settle(fixture);
    const rows = all('.rows .row');
    expect(rows.map((r) => r.querySelector<HTMLInputElement>('input.name')!.value)).toEqual([
      'Por hacer',
      'En curso',
      'Hecho',
    ]);
    for (const row of rows) {
      expect(row.querySelector('.grip')).not.toBeNull();
      expect(row.querySelectorAll('app-column-style .trigger')).toHaveLength(2);
    }
    expect(all('.kind')).toHaveLength(0);
  });

  it('disables Save until something changes', async () => {
    const fixture = setup(kanban);
    await settle(fixture);
    expect((q('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves a renamed column with its key, a new colour and a new column, keeping fieldDefs', async () => {
    const fixture = setup(kanban);
    await settle(fixture);
    await type(fixture, all('.rows .row input.name')[0] as HTMLInputElement, 'Pendiente');
    all('.rows .row')[0]!.querySelectorAll<HTMLElement>('.trigger')[1]!.click();
    await settle(fixture);
    document.body.querySelectorAll<HTMLElement>('.preset')[3]!.click();
    await settle(fixture);
    fixture.componentInstance['addColumn']();
    await settle(fixture);
    await save(fixture);
    expect(updates).toHaveLength(1);
    const update = updates[0]!;
    expect(update.fieldDefs).toEqual([]);
    expect(update.board!.columns[0]).toEqual({ key: 'todo', label: 'Pendiente', color: 'rose' });
    expect(update.board!.columns).toHaveLength(4);
    expect(update.board!.columns[3]!.key).toBe('nuevaColumna');
  });

  it('a column holding cards cannot be deleted; an empty one can', async () => {
    const fixture = setup(kanban, [{ column: 'todo' }, { column: 'todo' }, { column: 'doing' }]);
    await settle(fixture);
    const buttons = all('.rows .row button[aria-label="Quitar la columna"]') as HTMLButtonElement[];
    expect(buttons.map((b) => b.disabled)).toEqual([true, true, false]);
    expect(buttons[0]!.title).toContain('2 tarjetas');
    buttons[2]!.click();
    await settle(fixture);
    expect(all('.rows .row')).toHaveLength(2);
  });

  it('reorders columns and keeps their keys', async () => {
    const fixture = setup(kanban);
    await settle(fixture);
    const columns = fixture.componentInstance['columns']();
    fixture.componentInstance['setColumns'](moveItem(columns, 0, 2));
    await settle(fixture);
    await save(fixture);
    expect(updates[0]!.board!.columns.map((c) => c.key)).toEqual(['doing', 'done', 'todo']);
  });

  it('a table shows kinds (including unpickable ones) and options, and saves with keys', async () => {
    const fixture = setup(table);
    await settle(fixture);
    expect(all('.kind').map((k) => k.textContent!.trim())).toEqual(['Texto', 'Opciones', 'Dinero']);
    expect(all('.option')).toHaveLength(2);
    all('.option')[0]!.click();
    await settle(fixture);
    const input = q('.new-option') as HTMLInputElement;
    input.value = 'C';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await settle(fixture);
    await save(fixture);
    const defs = updates[0]!.fieldDefs!;
    expect(defs.map((d) => d.key)).toEqual(['nombre', 'estado', 'precio']);
    expect(defs[1]!.options).toEqual(['B', 'C']);
    expect(defs[2]!.type).toBe('money');
  });

  it('a deleted table column is dropped and a new one never reuses its key', async () => {
    const fixture = setup(table);
    await settle(fixture);
    (all('.row button[aria-label="Quitar la columna"]')[0] as HTMLElement).click();
    await settle(fixture);
    fixture.componentInstance['addField']();
    await settle(fixture);
    const names = all('.rows .row input.name') as HTMLInputElement[];
    await type(fixture, names[names.length - 1]!, 'Nombre');
    await save(fixture);
    expect(updates[0]!.fieldDefs!.map((d) => d.key)).toEqual(['estado', 'precio', 'nombre2']);
  });

  it('shows the API error inside the dialog and stays open', async () => {
    const fixture = setup(table);
    await settle(fixture);
    fail = true;
    await type(fixture, q('.form input.input') as HTMLInputElement, 'Otro nombre');
    await save(fixture);
    expect(q('.foot .alert').textContent).toBeTruthy();
    expect(q('#settings-form')).not.toBeNull();
  });

  it('emits closed on Cancel and reports unsaved changes', async () => {
    const fixture = setup(kanban);
    await settle(fixture);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await type(fixture, q('.form input.input') as HTMLInputElement, 'Otro');
    expect(fixture.componentInstance['dirty']()).toBe(true);
    (all('.foot .btn').find((b) => b.textContent!.includes('Cancelar')) as HTMLElement).click();
    expect(closed).toBe(1);
  });
});
