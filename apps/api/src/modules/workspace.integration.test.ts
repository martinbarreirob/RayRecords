import { LIST_PRESETS, type Item, type List } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/harness';

const h = await createHarness();

describe.skipIf(!h)('lists, items, notes, capture and calendar (integration)', () => {
  const { call } = h ?? ({} as Harness);

  let shopping: List;
  let board: List;
  let tasks: List;

  beforeAll(async () => {
    const created = await call('POST', '/lists', LIST_PRESETS.shopping);
    expect(created.status).toBe(201);
    shopping = created.body;
    board = (await call('POST', '/lists', LIST_PRESETS.board)).body;
    tasks = (
      await call('POST', '/lists', {
        name: 'Tareas',
        kind: 'free',
        captureAlias: 'tarea',
        fieldDefs: [],
      })
    ).body;
  });

  afterAll(async () => {
    await h?.close();
  });

  describe('lists', () => {
    it('creates from a preset with slug and order, and lists them', async () => {
      expect(shopping).toMatchObject({ slug: 'compras', captureAlias: 'compra', archived: false });
      const lists = (await call('GET', '/lists')).body as List[];
      expect(lists.map((l) => l.slug)).toEqual(['compras', 'proyecto', 'tareas']);
      expect(lists[0]!.order).toBeLessThan(lists[1]!.order);
    });

    it('generates unique slugs for repeated names', async () => {
      const second = await call('POST', '/lists', { name: 'Compras', kind: 'free' });
      expect(second.body.slug).toBe('compras-2');
    });

    it('a repeated alias gives 409 naming the list that uses it', async () => {
      const response = await call('POST', '/lists', {
        name: 'Otra',
        kind: 'free',
        captureAlias: 'compra',
      });
      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({ code: 'alias_in_use' });
      expect(response.body.error.message).toContain('Compras');
    });

    it('rejects fields with a repeated key', async () => {
      const field = { key: 'a', label: 'A', type: 'text' };
      const response = await call('POST', '/lists', {
        name: 'Rara',
        kind: 'free',
        fieldDefs: [field, field],
      });
      expect(response.status).toBe(400);
    });

    it('edits, removes the alias with null and archives', async () => {
      const { body: list } = await call('POST', '/lists', {
        name: 'Temporal',
        kind: 'free',
        captureAlias: 'temp',
      });
      const renamed = await call('PATCH', `/lists/${list.id}`, { name: 'Temporal 2' });
      expect(renamed.body).toMatchObject({ name: 'Temporal 2', slug: list.slug });

      const noAlias = await call('PATCH', `/lists/${list.id}`, { captureAlias: null });
      expect(noAlias.body.captureAlias).toBeUndefined();

      const clash = await call('PATCH', `/lists/${list.id}`, { captureAlias: 'compra' });
      expect(clash.status).toBe(409);

      await call('PATCH', `/lists/${list.id}`, { archived: true });
      const active = (await call('GET', '/lists')).body as List[];
      expect(active.some((l) => l.id === list.id)).toBe(false);
      const archived = (await call('GET', '/lists?archived=true')).body as List[];
      expect(archived.some((l) => l.id === list.id)).toBe(true);
    });

    it('a PATCH that does not mention the fields does not clear them', async () => {
      const { body: list } = await call('POST', '/lists', {
        name: 'Con campos',
        kind: 'free',
        fieldDefs: [{ key: 'nota', label: 'Nota', type: 'text' }],
      });
      const renamed = await call('PATCH', `/lists/${list.id}`, { name: 'Con campos 2' });
      expect(renamed.body.fieldDefs).toHaveLength(1);
    });

    it('PATCH of order reorders GET, persists, and leaves archived lists out', async () => {
      const make = async (name: string) =>
        (await call('POST', '/lists', { name, kind: 'free' })).body as List;
      const a = await make('Orden A');
      const b = await make('Orden B');
      const c = await make('Orden C');
      const mine = new Set([a.id, b.id, c.id]);
      const names = async () =>
        ((await call('GET', '/lists')).body as List[])
          .filter((l) => mine.has(l.id))
          .map((l) => l.name);
      expect(await names()).toEqual(['Orden A', 'Orden B', 'Orden C']);

      // C moves between A and B (midpoint) and the change only touches its order.
      const middle = (a.order + b.order) / 2;
      const moved = await call('PATCH', `/lists/${c.id}`, { order: middle });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ id: c.id, order: middle, name: 'Orden C' });
      expect(await names()).toEqual(['Orden A', 'Orden C', 'Orden B']);

      // To the start (below the first), even with a negative value.
      await call('PATCH', `/lists/${b.id}`, { order: a.order - 1000 });
      expect(await names()).toEqual(['Orden B', 'Orden A', 'Orden C']);

      // An archived list leaves the listing and keeps its order when restored.
      await call('PATCH', `/lists/${a.id}`, { archived: true });
      expect(await names()).toEqual(['Orden B', 'Orden C']);
      const archived = (await call('GET', '/lists?archived=true')).body as List[];
      expect(archived.find((l) => l.id === a.id)?.order).toBe(a.order);

      // A non-numeric order is rejected and changes nothing.
      const bad = await call('PATCH', `/lists/${b.id}`, { order: 'primero' });
      expect(bad.status).toBe(400);
      expect(await names()).toEqual(['Orden B', 'Orden C']);
    });

    it('PATCH of a missing list gives 404', async () => {
      const response = await call('PATCH', `/lists/${'a'.repeat(24)}`, { name: 'x' });
      expect(response.status).toBe(404);
    });
  });

  describe('items', () => {
    it('creates with increasing order and validates extra against the fields', async () => {
      const a = await call('POST', '/items', {
        listId: shopping.id,
        title: 'Cafetera',
        tags: ['hogar', 'hogar'],
        extra: { precio: 8900, estado: 'pendiente', libre: 'x' },
      });
      expect(a.status).toBe(201);
      expect(a.body.tags).toEqual(['hogar']);
      const b = await call('POST', '/items', { listId: shopping.id, title: 'Tostadora' });
      expect(b.body.order).toBeGreaterThan(a.body.order);

      const bad = await call('POST', '/items', {
        listId: shopping.id,
        title: 'Mal',
        extra: { precio: 'caro', estado: 'raro' },
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual([
        'extra.precio',
        'extra.estado',
      ]);
    });

    it('filters by tag, text and done; edits and completes', async () => {
      const { body: item } = await call('POST', '/items', {
        listId: shopping.id,
        title: 'Aspiradora robot',
        tags: ['limpieza'],
      });
      const byTag = (await call('GET', `/lists/${shopping.id}/items?tag=limpieza`)).body as Item[];
      expect(byTag.map((i) => i.id)).toEqual([item.id]);

      const byText = (await call('GET', `/lists/${shopping.id}/items?q=aspiradora`)).body as Item[];
      expect(byText.map((i) => i.id)).toEqual([item.id]);

      // Marking done must not touch tags or fields (regression: they used to be cleared).
      const onlyChecked = await call('PATCH', `/items/${item.id}`, { done: true });
      expect(onlyChecked.body.tags).toEqual(item.tags);
      expect(onlyChecked.body.extra).toEqual(item.extra);
      await call('PATCH', `/items/${item.id}`, { done: false });

      const done = await call('PATCH', `/items/${item.id}`, {
        done: true,
        title: 'Aspiradora',
        extra: { precio: 15000 },
        dueDate: '2026-12-01',
      });
      expect(done.body).toMatchObject({
        title: 'Aspiradora',
        dueDate: '2026-12-01',
        extra: { precio: 15000 },
      });
      expect(done.body.doneAt).toBeDefined();

      const onlyDone = (await call('GET', `/lists/${shopping.id}/items?done=true`)).body as Item[];
      expect(onlyDone.map((i) => i.id)).toContain(item.id);

      const reopened = await call('PATCH', `/items/${item.id}`, {
        done: false,
        dueDate: null,
        extra: { precio: null },
      });
      expect(reopened.body.doneAt).toBeUndefined();
      expect(reopened.body.dueDate).toBeUndefined();
      expect(reopened.body.extra.precio).toBeUndefined();
    });

    it('deletes and answers 404 once it is gone', async () => {
      const { body: item } = await call('POST', '/items', { listId: shopping.id, title: 'Borrar' });
      expect((await call('DELETE', `/items/${item.id}`)).status).toBe(204);
      expect((await call('DELETE', `/items/${item.id}`)).status).toBe(404);
    });

    it('on a board uses the first column by default and validates columns', async () => {
      const a = await call('POST', '/items', { listId: board.id, title: 'A' });
      expect(a.body.column).toBe('porHacer');
      expect(
        (await call('POST', '/items', { listId: board.id, title: 'X', column: 'nope' })).status,
      ).toBe(400);
      expect(
        (await call('POST', '/items', { listId: shopping.id, title: 'X', column: 'porHacer' }))
          .status,
      ).toBe(400);
    });

    it('moves between columns and reorders within a column', async () => {
      const make = async (title: string) =>
        (await call('POST', '/items', { listId: board.id, title })).body as Item;
      const [x, y, z] = [await make('X'), await make('Y'), await make('Z')];
      const titles = async (column: string) =>
        ((await call('GET', `/lists/${board.id}/items`)).body as Item[])
          .filter((i) => i.column === column)
          .map((i) => i.title);

      // Z to the top of "porHacer"
      await call('POST', `/items/${z!.id}/move`, { afterId: null });
      expect((await titles('porHacer')).slice(0, 1)).toEqual(['Z']);

      // Y to "enCurso"
      const moved = await call('POST', `/items/${y!.id}/move`, {
        afterId: null,
        column: 'enCurso',
      });
      expect(moved.body.column).toBe('enCurso');
      expect(await titles('enCurso')).toEqual(['Y']);

      // X after Y in "enCurso"
      await call('POST', `/items/${x!.id}/move`, { afterId: y!.id, column: 'enCurso' });
      expect(await titles('enCurso')).toEqual(['Y', 'X']);

      // reference in another column gives 400
      const bad = await call('POST', `/items/${x!.id}/move`, { afterId: z!.id, column: 'enCurso' });
      expect(bad.status).toBe(400);
    });

    it('renumbers the column when the gap between neighbours runs out', async () => {
      const make = async (title: string) =>
        (await call('POST', '/items', { listId: board.id, title, column: 'hecho' })).body as Item;
      const first = await make('P1');
      const last = await make('P2');
      const mover = await make('Mover');

      // Place "Mover" right after P1 again and again: each time the gap to P2 halves.
      for (let i = 0; i < 40; i++) {
        const response = await call('POST', `/items/${mover.id}/move`, { afterId: first.id });
        expect(response.status).toBe(200);
      }
      const order = ((await call('GET', `/lists/${board.id}/items`)).body as Item[])
        .filter((i) => i.column === 'hecho')
        .map((i) => i.title);
      expect(order).toEqual(['P1', 'Mover', 'P2']);
      void last;
    });
  });

  describe('daily notes', () => {
    it('a date without a note reads as empty; PUT creates and updates', async () => {
      const empty = await call('GET', '/notes/2026-11-01');
      expect(empty.body).toEqual({ date: '2026-11-01', content: '', updatedAt: null });

      const put = await call('PUT', '/notes/2026-11-01', { content: '# Hola' });
      expect(put.body).toMatchObject({ content: '# Hola' });
      await call('PUT', '/notes/2026-11-01', { content: '# Hola\nmundo' });
      expect((await call('GET', '/notes/2026-11-01')).body.content).toBe('# Hola\nmundo');
    });

    it('append adds a line without overwriting the previous content', async () => {
      await call('PUT', '/notes/2026-11-02', { content: 'primera' });
      const appended = await call('POST', '/notes/2026-11-02/append', { text: 'segunda' });
      expect(appended.body.content).toBe('primera\nsegunda');
      const onEmpty = await call('POST', '/notes/2026-11-03/append', { text: 'sola' });
      expect(onEmpty.body.content).toBe('sola');
    });

    it('two concurrent appends lose no line', async () => {
      await Promise.all([
        call('POST', '/notes/2026-11-04/append', { text: 'uno' }),
        call('POST', '/notes/2026-11-04/append', { text: 'dos' }),
      ]);
      const lines = (await call('GET', '/notes/2026-11-04')).body.content.split('\n').sort();
      expect(lines).toEqual(['dos', 'uno']);
    });

    it('lists the month dates that have a note and validates the date', async () => {
      const dates = (await call('GET', '/notes?month=2026-11')).body as string[];
      expect(dates).toEqual(expect.arrayContaining(['2026-11-01', '2026-11-02', '2026-11-03']));
      expect((await call('GET', '/notes/2026-02-30')).status).toBe(400);
    });
  });

  describe('quick capture', () => {
    it('creates an item in the alias list, mapping price and category', async () => {
      const response = await call('POST', '/capture', {
        text: 'compra: Cafetera @hogar 89€ #cocina https://tienda.es/c',
      });
      expect(response.body).toMatchObject({ kind: 'item', listName: 'Compras' });
      expect(response.body.item).toMatchObject({
        title: 'Cafetera',
        tags: ['cocina'],
        url: 'https://tienda.es/c',
        source: 'quick',
        extra: { precio: 8900, categoria: 'hogar' },
      });
    });

    it('hoy: goes to the list with alias "tarea", with a date', async () => {
      const response = await call('POST', '/capture', { text: 'hoy: llamar al dentista' });
      expect(response.body.kind).toBe('item');
      expect(response.body.item.listId).toBe(tasks.id);
      expect(response.body.item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('without a prefix creates a note card; two captures do not overlap', async () => {
      const first = await call('POST', '/capture', { text: 'idea suelta' });
      const second = await call('POST', '/capture', { text: 'otra idea' });
      expect(first.body.kind).toBe('note_card');
      expect(second.body.kind).toBe('note_card');
      expect(second.body.card).toMatchObject({ text: 'otra idea', doneAt: null, groupId: null });
      expect([second.body.card.x, second.body.card.y]).not.toEqual([
        first.body.card.x,
        first.body.card.y,
      ]);
      // Undoing is deleting the card.
      expect((await call('DELETE', `/note-cards/${second.body.card.id}`)).status).toBe(204);
    });

    it('a value that does not fit the field is dropped with a warning, without failing', async () => {
      const { body: list } = await call('POST', '/lists', {
        name: 'Estrictas',
        kind: 'free',
        captureAlias: 'estricta',
        fieldDefs: [{ key: 'categoria', label: 'Categoría', type: 'select', options: ['a', 'b'] }],
      });
      const response = await call('POST', '/capture', { text: 'estricta: cosa @zzz' });
      expect(response.body.kind).toBe('item');
      expect(response.body.item.listId).toBe(list.id);
      expect(response.body.item.extra.categoria).toBeUndefined();
      expect(response.body.warning).toContain('categoria');
    });

    it('hoy: without a task list falls back to a note with a warning', async () => {
      await call('PATCH', `/lists/${tasks.id}`, { archived: true });
      const response = await call('POST', '/capture', { text: 'mañana: pagar el seguro' });
      expect(response.body.kind).toBe('note_card');
      expect(response.body.card.text).toContain('pagar el seguro');
      expect(response.body.warning).toContain('tarea');
    });

    it('a prefix without content stores nothing', async () => {
      expect((await call('POST', '/capture', { text: 'compra:' })).body).toEqual({
        kind: 'empty',
      });
    });
  });

  describe('calendar', () => {
    it('returns the dated items in the range, with their list, and validates the range', async () => {
      await call('POST', '/items', { listId: board.id, title: 'Entrega', dueDate: '2027-03-10' });
      await call('POST', '/items', {
        listId: shopping.id,
        title: 'Comprar pan',
        dueDate: '2027-03-10',
        time: '09:30',
      });
      await call('POST', '/items', { listId: board.id, title: 'Fuera', dueDate: '2027-05-01' });

      const entries = (await call('GET', '/calendar?from=2027-03-01&to=2027-03-31')).body;
      expect(entries.map((e: { title: string }) => e.title)).toEqual(['Entrega', 'Comprar pan']);
      expect(entries[0]).toMatchObject({
        kind: 'item',
        listName: 'Proyecto',
        listSlug: 'proyecto',
      });

      expect((await call('GET', '/calendar?from=2027-03-31&to=2027-03-01')).status).toBe(400);
      expect((await call('GET', '/calendar?from=2020-01-01&to=2027-01-01')).status).toBe(400);
    });

    it('does not include items from archived lists', async () => {
      const { body: list } = await call('POST', '/lists', { name: 'Vieja', kind: 'free' });
      await call('POST', '/items', { listId: list.id, title: 'Antiguo', dueDate: '2027-04-04' });
      await call('PATCH', `/lists/${list.id}`, { archived: true });
      const entries = (await call('GET', '/calendar?from=2027-04-01&to=2027-04-30')).body;
      expect(entries).toEqual([]);
    });

    it('creates events without a list and mixes them with dated items, in order', async () => {
      const created = await call('POST', '/events', {
        title: 'Dentista',
        date: '2027-06-10',
        time: '08:00',
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ title: 'Dentista', date: '2027-06-10', time: '08:00' });
      await call('POST', '/events', { title: 'Cumpleaños', date: '2027-06-10' });
      await call('POST', '/items', { listId: board.id, title: 'Entrega', dueDate: '2027-06-10' });
      await call('POST', '/events', { title: 'Fuera', date: '2027-07-01' });

      const entries = (await call('GET', '/calendar?from=2027-06-01&to=2027-06-30')).body;
      expect(entries.map((e: { title: string }) => e.title)).toEqual([
        'Entrega',
        'Cumpleaños',
        'Dentista',
      ]);
      expect(entries[0]).toMatchObject({ kind: 'item', listName: 'Proyecto' });
      expect(entries[1]).toMatchObject({ kind: 'event', dueDate: '2027-06-10' });
      expect(entries[1].listName).toBeUndefined();
    });

    it('marks an event as done, edits it and removes it', async () => {
      const { body: event } = await call('POST', '/events', {
        title: 'Llamar',
        date: '2027-08-02',
        time: '10:00',
      });

      const done = await call('PATCH', `/events/${event.id}`, { done: true });
      expect(done.body.doneAt).toBeDefined();

      const edited = await call('PATCH', `/events/${event.id}`, {
        title: 'Llamar al banco',
        time: null,
        done: false,
      });
      expect(edited.body.title).toBe('Llamar al banco');
      expect(edited.body.time).toBeUndefined();
      expect(edited.body.doneAt).toBeUndefined();

      expect((await call('DELETE', `/events/${event.id}`)).status).toBe(204);
      expect((await call('DELETE', `/events/${event.id}`)).status).toBe(404);
      expect((await call('PATCH', `/events/${event.id}`, { done: true })).status).toBe(404);
    });

    it('rejects an event without a valid date or title', async () => {
      expect((await call('POST', '/events', { title: 'Sin fecha' })).status).toBe(400);
      expect((await call('POST', '/events', { title: '', date: '2027-01-01' })).status).toBe(400);
      expect((await call('POST', '/events', { title: 'Mal', date: '2027-13-40' })).status).toBe(
        400,
      );
    });
  });
});
