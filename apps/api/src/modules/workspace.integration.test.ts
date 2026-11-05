import { LIST_PRESETS, type Item, type List } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/harness';

const h = await createHarness();

describe.skipIf(!h)('listas, elementos, notas, captura y calendario (integración)', () => {
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

  describe('listas', () => {
    it('crea desde un preset con slug y orden, y las lista', async () => {
      expect(shopping).toMatchObject({ slug: 'compras', captureAlias: 'compra', archived: false });
      const lists = (await call('GET', '/lists')).body as List[];
      expect(lists.map((l) => l.slug)).toEqual(['compras', 'proyecto', 'tareas']);
      expect(lists[0]!.order).toBeLessThan(lists[1]!.order);
    });

    it('genera slugs únicos para nombres repetidos', async () => {
      const second = await call('POST', '/lists', { name: 'Compras', kind: 'free' });
      expect(second.body.slug).toBe('compras-2');
    });

    it('un alias repetido da 409 con el nombre de la lista que lo usa', async () => {
      const response = await call('POST', '/lists', {
        name: 'Otra',
        kind: 'free',
        captureAlias: 'compra',
      });
      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({ code: 'alias_in_use' });
      expect(response.body.error.message).toContain('Compras');
    });

    it('rechaza campos con la clave repetida', async () => {
      const field = { key: 'a', label: 'A', type: 'text' };
      const response = await call('POST', '/lists', {
        name: 'Rara',
        kind: 'free',
        fieldDefs: [field, field],
      });
      expect(response.status).toBe(400);
    });

    it('edita, quita el alias con null y archiva', async () => {
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

    it('un PATCH que no menciona los campos no los vacía', async () => {
      const { body: list } = await call('POST', '/lists', {
        name: 'Con campos',
        kind: 'free',
        fieldDefs: [{ key: 'nota', label: 'Nota', type: 'text' }],
      });
      const renamed = await call('PATCH', `/lists/${list.id}`, { name: 'Con campos 2' });
      expect(renamed.body.fieldDefs).toHaveLength(1);
    });

    it('PATCH de order reordena el GET, persiste y deja fuera las archivadas', async () => {
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

      // C pasa entre A y B (punto medio) y el cambio solo toca su order.
      const middle = (a.order + b.order) / 2;
      const moved = await call('PATCH', `/lists/${c.id}`, { order: middle });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ id: c.id, order: middle, name: 'Orden C' });
      expect(await names()).toEqual(['Orden A', 'Orden C', 'Orden B']);

      // Al principio (por debajo del primero), incluso con un valor negativo.
      await call('PATCH', `/lists/${b.id}`, { order: a.order - 1000 });
      expect(await names()).toEqual(['Orden B', 'Orden A', 'Orden C']);

      // Una archivada sale del listado y recuperarla conserva su orden.
      await call('PATCH', `/lists/${a.id}`, { archived: true });
      expect(await names()).toEqual(['Orden B', 'Orden C']);
      const archived = (await call('GET', '/lists?archived=true')).body as List[];
      expect(archived.find((l) => l.id === a.id)?.order).toBe(a.order);

      // Un order que no es número se rechaza y no altera nada.
      const bad = await call('PATCH', `/lists/${b.id}`, { order: 'primero' });
      expect(bad.status).toBe(400);
      expect(await names()).toEqual(['Orden B', 'Orden C']);
    });

    it('PATCH de una lista inexistente da 404', async () => {
      const response = await call('PATCH', `/lists/${'a'.repeat(24)}`, { name: 'x' });
      expect(response.status).toBe(404);
    });
  });

  describe('elementos', () => {
    it('crea con orden creciente y valida extra contra los campos', async () => {
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

    it('filtra por tag, texto y hecho; edita y completa', async () => {
      const { body: item } = await call('POST', '/items', {
        listId: shopping.id,
        title: 'Aspiradora robot',
        tags: ['limpieza'],
      });
      const byTag = (await call('GET', `/lists/${shopping.id}/items?tag=limpieza`)).body as Item[];
      expect(byTag.map((i) => i.id)).toEqual([item.id]);

      const byText = (await call('GET', `/lists/${shopping.id}/items?q=aspiradora`)).body as Item[];
      expect(byText.map((i) => i.id)).toEqual([item.id]);

      // Marcar como hecho no debe tocar las etiquetas ni los campos (regresión: se vaciaban).
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

    it('borra y responde 404 si ya no existe', async () => {
      const { body: item } = await call('POST', '/items', { listId: shopping.id, title: 'Borrar' });
      expect((await call('DELETE', `/items/${item.id}`)).status).toBe(204);
      expect((await call('DELETE', `/items/${item.id}`)).status).toBe(404);
    });

    it('en un tablero usa la primera columna por defecto y valida las columnas', async () => {
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

    it('mueve entre columnas y reordena dentro de una columna', async () => {
      const make = async (title: string) =>
        (await call('POST', '/items', { listId: board.id, title })).body as Item;
      const [x, y, z] = [await make('X'), await make('Y'), await make('Z')];
      const titles = async (column: string) =>
        ((await call('GET', `/lists/${board.id}/items`)).body as Item[])
          .filter((i) => i.column === column)
          .map((i) => i.title);

      // Z al principio de "porHacer"
      await call('POST', `/items/${z!.id}/move`, { afterId: null });
      expect((await titles('porHacer')).slice(0, 1)).toEqual(['Z']);

      // Y a "enCurso"
      const moved = await call('POST', `/items/${y!.id}/move`, {
        afterId: null,
        column: 'enCurso',
      });
      expect(moved.body.column).toBe('enCurso');
      expect(await titles('enCurso')).toEqual(['Y']);

      // X tras Y en "enCurso"
      await call('POST', `/items/${x!.id}/move`, { afterId: y!.id, column: 'enCurso' });
      expect(await titles('enCurso')).toEqual(['Y', 'X']);

      // referencia en otra columna → 400
      const bad = await call('POST', `/items/${x!.id}/move`, { afterId: z!.id, column: 'enCurso' });
      expect(bad.status).toBe(400);
    });

    it('renumera la columna cuando se agota el hueco entre vecinos', async () => {
      const make = async (title: string) =>
        (await call('POST', '/items', { listId: board.id, title, column: 'hecho' })).body as Item;
      const first = await make('P1');
      const last = await make('P2');
      const mover = await make('Mover');

      // Se coloca "Mover" una y otra vez justo tras P1: cada vez el hueco con P2 se divide por dos.
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

  describe('notas del día', () => {
    it('una fecha sin nota se ve vacía; PUT crea y actualiza', async () => {
      const empty = await call('GET', '/notes/2026-11-01');
      expect(empty.body).toEqual({ date: '2026-11-01', content: '', updatedAt: null });

      const put = await call('PUT', '/notes/2026-11-01', { content: '# Hola' });
      expect(put.body).toMatchObject({ content: '# Hola' });
      await call('PUT', '/notes/2026-11-01', { content: '# Hola\nmundo' });
      expect((await call('GET', '/notes/2026-11-01')).body.content).toBe('# Hola\nmundo');
    });

    it('append añade una línea sin pisar lo anterior', async () => {
      await call('PUT', '/notes/2026-11-02', { content: 'primera' });
      const appended = await call('POST', '/notes/2026-11-02/append', { text: 'segunda' });
      expect(appended.body.content).toBe('primera\nsegunda');
      const onEmpty = await call('POST', '/notes/2026-11-03/append', { text: 'sola' });
      expect(onEmpty.body.content).toBe('sola');
    });

    it('dos append simultáneos no pierden ninguna línea', async () => {
      await Promise.all([
        call('POST', '/notes/2026-11-04/append', { text: 'uno' }),
        call('POST', '/notes/2026-11-04/append', { text: 'dos' }),
      ]);
      const lines = (await call('GET', '/notes/2026-11-04')).body.content.split('\n').sort();
      expect(lines).toEqual(['dos', 'uno']);
    });

    it('lista las fechas del mes con nota y valida la fecha', async () => {
      const dates = (await call('GET', '/notes?month=2026-11')).body as string[];
      expect(dates).toEqual(expect.arrayContaining(['2026-11-01', '2026-11-02', '2026-11-03']));
      expect((await call('GET', '/notes/2026-02-30')).status).toBe(400);
    });
  });

  describe('captura rápida', () => {
    it('crea un elemento en la lista del alias, mapeando precio y categoría', async () => {
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

    it('hoy: va a la lista con alias «tarea», con fecha', async () => {
      const response = await call('POST', '/capture', { text: 'hoy: llamar al dentista' });
      expect(response.body.kind).toBe('item');
      expect(response.body.item.listId).toBe(tasks.id);
      expect(response.body.item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('sin prefijo crea una tarjeta de nota; dos capturas no se solapan', async () => {
      const first = await call('POST', '/capture', { text: 'idea suelta' });
      const second = await call('POST', '/capture', { text: 'otra idea' });
      expect(first.body.kind).toBe('note_card');
      expect(second.body.kind).toBe('note_card');
      expect(second.body.card).toMatchObject({ text: 'otra idea', doneAt: null, groupId: null });
      expect([second.body.card.x, second.body.card.y]).not.toEqual([
        first.body.card.x,
        first.body.card.y,
      ]);
      // Deshacer es borrar la tarjeta.
      expect((await call('DELETE', `/note-cards/${second.body.card.id}`)).status).toBe(204);
    });

    it('un dato que no encaja con el campo se descarta con aviso, sin fallar', async () => {
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

    it('hoy: sin lista de tareas cae a una nota con aviso', async () => {
      await call('PATCH', `/lists/${tasks.id}`, { archived: true });
      const response = await call('POST', '/capture', { text: 'mañana: pagar el seguro' });
      expect(response.body.kind).toBe('note_card');
      expect(response.body.card.text).toContain('pagar el seguro');
      expect(response.body.warning).toContain('tarea');
    });

    it('un prefijo sin contenido no guarda nada', async () => {
      expect((await call('POST', '/capture', { text: 'compra:' })).body).toEqual({
        kind: 'empty',
      });
    });
  });

  describe('calendario', () => {
    it('devuelve los elementos con fecha del rango, con su lista, y valida el rango', async () => {
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
      expect(entries[0]).toMatchObject({ listName: 'Proyecto', listSlug: 'proyecto' });

      expect((await call('GET', '/calendar?from=2027-03-31&to=2027-03-01')).status).toBe(400);
      expect((await call('GET', '/calendar?from=2020-01-01&to=2027-01-01')).status).toBe(400);
    });

    it('no incluye elementos de listas archivadas', async () => {
      const { body: list } = await call('POST', '/lists', { name: 'Vieja', kind: 'free' });
      await call('POST', '/items', { listId: list.id, title: 'Antiguo', dueDate: '2027-04-04' });
      await call('PATCH', `/lists/${list.id}`, { archived: true });
      const entries = (await call('GET', '/calendar?from=2027-04-01&to=2027-04-30')).body;
      expect(entries).toEqual([]);
    });
  });
});
