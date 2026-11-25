import { TestBed } from '@angular/core/testing';
import type { CreateItem, Item, List } from '@rayrecords/shared';
import { of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ItemDialog } from './item-dialog';

const stamp = '2026-11-04T09:00:00.000Z';
const list = {
  id: 'b'.repeat(24),
  name: 'Proyectos',
  slug: 'proyectos',
  kind: 'board',
  fieldDefs: [],
  board: {
    columns: [
      { key: 'porHacer', label: 'Por hacer' },
      { key: 'hecho', label: 'Hecho' },
    ],
  },
} as unknown as List;

describe('ItemDialog creating', () => {
  it('creates an element in the first column with the typed title', async () => {
    const created: CreateItem[] = [];
    const api = {
      createItem: (input: CreateItem) => {
        created.push(input);
        return of({
          ...input,
          id: 'a'.repeat(24),
          createdAt: stamp,
          updatedAt: stamp,
        } as unknown as Item);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(ItemDialog);
    fixture.componentRef.setInput('list', list);
    fixture.componentRef.setInput('creating', true);
    const saved: Item[] = [];
    fixture.componentInstance.saved.subscribe((item) => saved.push(item));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const body = document.body;
    expect(body.querySelector('.p-dialog-title')!.textContent).toContain('Nuevo elemento');
    expect(body.querySelector('.foot .btn.danger')).toBeNull();
    const title = body.querySelector<HTMLInputElement>('form input.input')!;
    title.value = 'Reserva online';
    title.dispatchEvent(new Event('input'));
    body.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      listId: list.id,
      title: 'Reserva online',
      column: 'porHacer',
      source: 'manual',
    });
    expect(saved).toHaveLength(1);
  });
});
