import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { BoardColumn, Item, UpdateItem } from '@rayrecords/shared';
import { of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ItemSidebar } from './item-sidebar';

const stamp = '2026-11-04T09:00:00.000Z';
const item = {
  id: 'a'.repeat(24),
  listId: 'b'.repeat(24),
  title: 'Reserva online',
  text: 'Probar con el calendario',
  tags: [],
  extra: {},
  column: 'enCurso',
  order: 1,
  source: 'manual',
  createdAt: stamp,
  updatedAt: stamp,
} as Item;
const columns: BoardColumn[] = [
  { key: 'porHacer', label: 'Por hacer', color: 'blue' },
  { key: 'enCurso', label: 'En curso', color: 'amber' },
  { key: 'hecho', label: 'Hecho', color: 'green' },
];

describe('ItemSidebar', () => {
  let updates: { id: string; input: UpdateItem }[];

  function setup(): ComponentFixture<ItemSidebar> {
    updates = [];
    const api = {
      updateItem: (id: string, input: UpdateItem) => {
        updates.push({ id, input });
        return of({ ...item, ...input } as unknown as Item);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(ItemSidebar);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('columns', columns);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<ItemSidebar>) => fixture.nativeElement as HTMLElement;

  it('is a panel with the title and the description on the left and the properties on the right', () => {
    const root = el(setup());
    const panel = root.querySelector('aside.panel')!;
    expect(panel.querySelector('.main input.title')).not.toBeNull();
    expect(panel.querySelector('.main textarea.description')).not.toBeNull();
    expect(panel.querySelector<HTMLInputElement>('input.title')!.value).toBe('Reserva online');
    expect(panel.querySelector<HTMLTextAreaElement>('textarea.description')!.value).toBe(
      'Probar con el calendario',
    );
    const props = panel.querySelector('.props')!;
    const labels = [...props.querySelectorAll('.label')].map((l) => l.textContent!.trim());
    expect(labels).toEqual(['Properties', 'Etiquetas']);
    // The delete button is the last thing of the properties.
    expect(props.lastElementChild!.textContent!.trim()).toBe('Eliminar');
    expect(panel.querySelector('button[aria-label="Cerrar"]')).toBeNull();
  });

  it('shows the state and the priority as chips that open a menu with the options', () => {
    const fixture = setup();
    const root = el(fixture);
    const chips = root.querySelectorAll<HTMLElement>('app-dropdown .trigger');
    expect(chips[0]!.textContent).toContain('En curso');
    expect(chips[0]!.querySelector('app-status-icon')).not.toBeNull();
    expect(chips[1]!.textContent).toContain('Sin prioridad');
    expect(document.body.querySelector('.dd-menu')).toBeNull();

    chips[0]!.click();
    fixture.detectChanges();
    const options = document.body.querySelectorAll<HTMLElement>('.dd-menu .dd-opt');
    expect([...options].map((o) => o.textContent!.trim())).toEqual([
      'Por hacer',
      'En curso',
      'Hecho',
    ]);
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');

    const moved: string[] = [];
    fixture.componentInstance.moveTo.subscribe((key) => moved.push(key));
    options[2]!.click();
    fixture.detectChanges();
    expect(moved).toEqual(['hecho']);
    expect(document.body.querySelector('.dd-menu')).toBeNull();
  });

  it('saves the priority in extra and clears it with null', () => {
    const fixture = setup();
    const sidebar = fixture.componentInstance as unknown as { setPriority(v: string | null): void };
    sidebar.setPriority('high');
    sidebar.setPriority(null);
    expect(updates.map((u) => u.input)).toEqual([
      { extra: { priority: 'high' } },
      { extra: { priority: null } },
    ]);
  });

  it('a press on empty space of the panel takes the focus out of the text', () => {
    const fixture = setup();
    document.body.append(el(fixture));
    const description = el(fixture).querySelector<HTMLTextAreaElement>('textarea.description')!;
    description.focus();
    expect(document.activeElement).toBe(description);
    el(fixture)
      .querySelector('.props .label')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.activeElement).not.toBe(description);
    el(fixture).remove();
  });

  it('saves the title and the description when they lose the focus, and only if they changed', () => {
    const fixture = setup();
    const description = el(fixture).querySelector<HTMLTextAreaElement>('textarea.description')!;
    description.dispatchEvent(new Event('blur'));
    expect(updates).toHaveLength(0);

    description.value = 'Nueva descripción';
    description.dispatchEvent(new Event('input'));
    description.dispatchEvent(new Event('blur'));
    expect(updates).toEqual([
      { id: item.id, input: { title: 'Reserva online', text: 'Nueva descripción' } },
    ]);

    // Saved already: leaving it does not save the same again.
    description.dispatchEvent(new Event('blur'));
    expect(updates).toHaveLength(1);
  });

  it('clears the description with null and keeps the old title when it is left empty', () => {
    const fixture = setup();
    const title = el(fixture).querySelector<HTMLInputElement>('input.title')!;
    const description = el(fixture).querySelector<HTMLTextAreaElement>('textarea.description')!;
    title.value = '  ';
    title.dispatchEvent(new Event('input'));
    title.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(updates).toHaveLength(0);
    expect(title.value).toBe('Reserva online');

    description.value = '';
    description.dispatchEvent(new Event('input'));
    description.dispatchEvent(new Event('blur'));
    expect(updates[0]!.input).toEqual({ title: 'Reserva online', text: null });
  });

  it('a plus button at the end of the labels shows the field to add one', async () => {
    const fixture = setup();
    const root = el(fixture);
    expect(root.querySelector('input[aria-label="Añadir etiqueta"]')).toBeNull();
    root.querySelector<HTMLElement>('button.add-tag')!.click();
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Añadir etiqueta"]')!;
    input.value = ' Urgente ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(updates).toEqual([{ id: item.id, input: { tags: ['urgente'] } }]);
  });

  it('slides out and then closes with Escape or a click outside', async () => {
    for (const close of [
      (root: HTMLElement) => root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
      (root: HTMLElement) => root.querySelector<HTMLElement>('.backdrop')!.click(),
    ]) {
      TestBed.resetTestingModule();
      const fixture = setup();
      let closed = 0;
      fixture.componentInstance.closed.subscribe(() => closed++);
      close(el(fixture));
      fixture.detectChanges();
      expect(el(fixture).querySelector('aside.panel')!.classList).toContain('leaving');
      expect(closed).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 220));
      expect(closed).toBe(1);
    }
  });
});
