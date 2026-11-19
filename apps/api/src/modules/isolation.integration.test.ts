import { BANK_RULES, DEFAULT_CATEGORIES } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCollections } from '../db/client';
import { runWithData, scopedCollections } from '../db/scope';
import { createHarness, type Harness, type TestUser } from '../test/harness';

const h = await createHarness();

const MISSING_ID = 'a'.repeat(24);
const HEADER = 'Fecha operación;Concepto;Importe;Saldo';

describe.skipIf(!h)('data isolation between users (integration)', () => {
  const harness = h ?? ({} as Harness);
  const a = { call: harness.call, cookie: harness.cookie } as TestUser; // unprefixed user
  let b: TestUser; // user with the `demo_` prefix

  const importCsv = async (user: TestUser, accountId: string, body: string) => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/accounts/${accountId}/imports?fileName=extracto.csv`,
      headers: { cookie: user.cookie, 'content-type': 'text/csv' },
      payload: Buffer.from(body, 'utf8'),
    });
    return { status: response.statusCode, body: JSON.parse(response.body) };
  };

  beforeAll(async () => {
    b = await harness.createUser('demo', 'demo_');
  });

  afterAll(async () => {
    await h?.close();
  });

  it('unauthenticated requests still get 401', async () => {
    for (const url of ['/api/lists', '/api/accounts', '/api/tickets', '/api/dashboard']) {
      const response = await harness.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
    }
    const forged = await harness.app.inject({
      method: 'GET',
      url: '/api/lists',
      headers: { cookie: 'rr_session=forged' },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('each session cookie identifies its own user', async () => {
    const meA = await harness.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: a.cookie },
    });
    const meB = await harness.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: b.cookie },
    });
    expect(meA.json().username).toBe('martin');
    expect(meB.json().username).toBe('demo');
  });

  describe('lists and items', () => {
    let listA: { id: string };
    let itemA: { id: string };

    it('B sees nothing of what A creates, and cannot touch it', async () => {
      listA = (await a.call('POST', '/lists', { name: 'Secret', kind: 'free' })).body;
      itemA = (await a.call('POST', '/items', { listId: listA.id, title: 'Private' })).body;

      expect((await a.call('GET', '/lists')).body).toHaveLength(1);
      expect((await b.call('GET', '/lists')).body).toEqual([]);
      expect((await b.call('GET', '/lists?archived=true')).body).toEqual([]);
      expect((await b.call('GET', `/lists/${listA.id}/items`)).body).toEqual([]);

      expect((await b.call('PATCH', `/lists/${listA.id}`, { name: 'Hacked' })).status).toBe(404);
      expect((await b.call('PATCH', `/items/${itemA.id}`, { done: true })).status).toBe(404);
      expect((await b.call('DELETE', `/items/${itemA.id}`)).status).toBe(404);
      expect(
        (await b.call('POST', '/items', { listId: listA.id, title: 'Intruder' })).status,
      ).toBeGreaterThanOrEqual(400);

      // A's data is intact.
      const lists = (await a.call('GET', '/lists')).body;
      expect(lists[0].name).toBe('Secret');
      const items = (await a.call('GET', `/lists/${listA.id}/items`)).body as { title: string }[];
      expect(items.map((i) => i.title)).toEqual(['Private']);
    });

    it('the same slug and alias can exist in both users', async () => {
      const own = await b.call('POST', '/lists', {
        name: 'Secret',
        kind: 'free',
        captureAlias: 'sec',
      });
      expect(own.status).toBe(201);
      expect(own.body.slug).toBe('secret');
      const sameAlias = await a.call('POST', '/lists', {
        name: 'Other',
        kind: 'free',
        captureAlias: 'sec',
      });
      expect(sameAlias.status).toBe(201);
      expect((await b.call('GET', '/lists')).body).toHaveLength(1);
    });

    it('capture creates data only for the user who sends it', async () => {
      await b.call('POST', '/capture', { text: 'sec: only mine' });
      const itemsA = (await a.call('GET', `/lists/${listA.id}/items`)).body as { title: string }[];
      expect(itemsA.map((i) => i.title)).toEqual(['Private']);
    });
  });

  describe('daily notes', () => {
    it('a note of A reads as empty for B, and each one has its own', async () => {
      await a.call('PUT', '/notes/2026-11-01', { content: 'only A' });
      expect((await b.call('GET', '/notes/2026-11-01')).body).toEqual({
        date: '2026-11-01',
        content: '',
        updatedAt: null,
      });
      expect((await b.call('GET', '/notes?month=2026-11')).body).toEqual([]);

      await b.call('POST', '/notes/2026-11-01/append', { text: 'only B' });
      expect((await a.call('GET', '/notes/2026-11-01')).body.content).toBe('only A');
      expect((await b.call('GET', '/notes/2026-11-01')).body.content).toBe('only B');
    });
  });

  describe('note cards and groups', () => {
    it('are invisible and untouchable for the other user', async () => {
      const group = (await a.call('POST', '/note-groups', { title: 'Group A', x: 0, y: 0 })).body;
      const card = (await a.call('POST', '/note-cards', { text: 'Card A', x: 10, y: 10 })).body;
      expect(group.id).toBeDefined();
      expect(card.id).toBeDefined();

      const boardB = (await b.call('GET', '/note-cards')).body;
      expect(boardB.cards).toEqual([]);
      expect(boardB.groups).toEqual([]);
      expect((await b.call('GET', '/note-cards/done')).body).toEqual([]);

      expect((await b.call('PATCH', `/note-cards/${card.id}`, { text: 'Hacked' })).status).toBe(
        404,
      );
      expect((await b.call('DELETE', `/note-cards/${card.id}`)).status).toBe(404);
      expect((await b.call('PATCH', `/note-groups/${group.id}`, { title: 'Hacked' })).status).toBe(
        404,
      );
      expect((await b.call('DELETE', `/note-groups/${group.id}`)).status).toBe(404);

      const boardA = (await a.call('GET', '/note-cards')).body;
      expect(boardA.cards.map((c: { text: string }) => c.text)).toContain('Card A');
      expect(boardA.groups).toHaveLength(1);

      // Capture without a prefix lands in the card collection of its own user.
      await b.call('POST', '/capture', { text: 'loose idea of B' });
      const afterA = (await a.call('GET', '/note-cards')).body;
      expect(afterA.cards.map((c: { text: string }) => c.text)).not.toContain('loose idea of B');
      expect((await b.call('GET', '/note-cards')).body.cards).toHaveLength(1);
    });
  });

  describe('calendar events', () => {
    it('events and the calendar are per user', async () => {
      const event = (await a.call('POST', '/events', { title: 'Dentist', date: '2027-02-10' }))
        .body;
      const range = '/calendar?from=2027-02-01&to=2027-02-28';
      expect((await a.call('GET', range)).body).toHaveLength(1);
      expect((await b.call('GET', range)).body).toEqual([]);

      expect((await b.call('PATCH', `/events/${event.id}`, { done: true })).status).toBe(404);
      expect((await b.call('DELETE', `/events/${event.id}`)).status).toBe(404);
      expect((await a.call('GET', range)).body).toHaveLength(1);
    });
  });

  describe('expense categories and rules', () => {
    it('B starts with the default catalog only', async () => {
      const categories = (await b.call('GET', '/categories')).body as { key: string }[];
      expect(categories.map((c) => c.key).sort()).toEqual(
        DEFAULT_CATEGORIES.map((c) => c.key).sort(),
      );
      const rules = (await b.call('GET', '/rules')).body as unknown[];
      expect(rules.length).toBe(BANK_RULES.length);
      // The first user's collections never got the default catalog in this database.
      expect((await a.call('GET', '/categories')).body).toEqual([]);
      expect((await a.call('GET', '/rules')).body).toEqual([]);
    });

    it('a category or rule of one user is invisible to the other; the same key can coexist', async () => {
      const onlyA = await a.call('POST', '/categories', { key: 'onlya', name: 'Only A' });
      expect(onlyA.status).toBe(201);
      const keysB = ((await b.call('GET', '/categories')).body as { key: string }[]).map(
        (c) => c.key,
      );
      expect(keysB).not.toContain('onlya');
      expect((await b.call('PATCH', '/categories/onlya', { name: 'Hacked' })).status).toBe(404);

      const shared = await b.call('POST', '/categories', { key: 'onlya', name: 'Mine' });
      expect(shared.status).toBe(201);
      expect(
        ((await a.call('GET', '/categories')).body as { name: string }[]).map((c) => c.name),
      ).toEqual(['Only A']);

      const ruleA = await a.call('POST', '/rules', {
        pattern: 'zzz-only-a',
        matchType: 'contains',
        categoryKey: 'onlya',
      });
      expect(ruleA.status).toBe(201);
      const rulesB = (await b.call('GET', '/rules')).body as { pattern: string }[];
      expect(rulesB.map((r) => r.pattern)).not.toContain('zzz-only-a');
      expect((await b.call('DELETE', `/rules/${ruleA.body.id}`)).status).toBe(404);

      const ruleB = await b.call('POST', '/rules', {
        pattern: 'zzz-only-b',
        matchType: 'contains',
        categoryKey: 'onlya',
      });
      expect(ruleB.status).toBe(201);
      const rulesA = (await a.call('GET', '/rules')).body as { pattern: string }[];
      expect(rulesA.map((r) => r.pattern)).toEqual(['zzz-only-a']);
    });
  });

  describe('accounts and transactions', () => {
    it('are per user, including imports and the review queue', async () => {
      const account = (
        await a.call('POST', '/accounts', {
          name: 'Checking A',
          type: 'checking',
          openingBalanceCents: 1000,
          openingDate: '2026-01-01',
        })
      ).body;
      const imported = await importCsv(
        a,
        account.id,
        [HEADER, '02/01/2026;Mercadona;-12,50;987,50'].join('\n'),
      );
      expect(imported.status).toBeLessThan(300);
      expect(((await a.call('GET', '/transactions?')).body as { total: number }).total).toBe(1);

      expect((await b.call('GET', '/accounts')).body).toEqual([]);
      expect((await b.call('GET', '/transactions?')).body).toMatchObject({ items: [], total: 0 });
      expect((await b.call('GET', '/imports')).body).toEqual([]);

      expect((await b.call('PATCH', `/accounts/${account.id}`, { name: 'Hacked' })).status).toBe(
        404,
      );
      const intruder = await importCsv(
        b,
        account.id,
        [HEADER, '02/01/2026;Intruder;-1,00;1,00'].join('\n'),
      );
      expect(intruder.status).toBe(404);
      expect(((await a.call('GET', '/transactions?')).body as { total: number }).total).toBe(1);
    });
  });

  describe('stock, tickets and dashboard', () => {
    it('A sells; B sees no tickets, stock or dashboard figures; numbers are independent', async () => {
      const category = (await a.call('POST', '/stock/categories', { name: 'Drinks' })).body;
      const product = (
        await a.call('POST', '/stock/products', {
          name: 'Water',
          quantity: 10,
          priceCents: 100,
          categoryId: category.id,
        })
      ).body;
      const sold = await a.call('POST', '/tickets', {
        lines: [{ productId: product.id, quantity: 2 }],
      });
      expect(sold.status).toBe(201);
      expect(sold.body.number).toBe(1);

      expect((await b.call('GET', '/stock/categories')).body).toEqual([]);
      expect((await b.call('GET', '/stock/products')).body).toEqual([]);
      expect((await b.call('GET', '/tickets')).body).toEqual([]);

      const dashB = (await b.call('GET', '/dashboard?days=30')).body;
      expect(JSON.stringify(dashB)).not.toContain('Water');
      const dashA = (await a.call('GET', '/dashboard?days=30')).body;
      expect(JSON.stringify(dashA)).toContain('Water');

      // B cannot sell, edit or delete A's product or category.
      const stolen = await b.call('POST', '/tickets', {
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(stolen.status).toBeGreaterThanOrEqual(400);
      expect((await b.call('PATCH', `/stock/products/${product.id}`, { quantity: 0 })).status).toBe(
        404,
      );
      expect((await b.call('DELETE', `/stock/products/${product.id}`)).status).toBe(404);
      expect(
        (await b.call('PATCH', `/stock/categories/${category.id}`, { name: 'Hacked' })).status,
      ).toBe(404);
      expect((await b.call('DELETE', `/stock/categories/${category.id}`)).status).toBe(404);
      const stock = (await a.call('GET', '/stock/products')).body as { quantity: number }[];
      expect(stock[0]!.quantity).toBe(8);

      // B's first ticket is number 1 too.
      const own = (
        await b.call('POST', '/stock/products', { name: 'Tea', quantity: 5, priceCents: 200 })
      ).body;
      const ownTicket = await b.call('POST', '/tickets', {
        lines: [{ productId: own.id, quantity: 1 }],
      });
      expect(ownTicket.status).toBe(201);
      expect(ownTicket.body.number).toBe(1);
      expect((await a.call('GET', '/tickets')).body).toHaveLength(1);
      expect((await b.call('GET', '/tickets')).body).toHaveLength(1);
      expect(JSON.stringify((await a.call('GET', '/dashboard?days=30')).body)).not.toContain('Tea');
    });
  });

  describe('storage', () => {
    it("B's data lives only in demo_* collections and A's in the unprefixed ones", async () => {
      const db = harness.database.db;
      const count = (name: string) => db.collection(name).countDocuments();

      expect(await count('demo_lists')).toBe(1);
      expect(await count('demo_events')).toBe(0);
      expect(await count('demo_daily_notes')).toBe(1);
      expect(await count('demo_note_cards')).toBe(1);
      expect(await count('demo_accounts')).toBe(0);
      expect(await count('demo_tickets')).toBe(1);
      expect(await count('demo_products')).toBe(1);
      expect(await count('demo_categories')).toBe(DEFAULT_CATEGORIES.length + 1);

      // The unprefixed collections hold only what A made.
      expect(await count('lists')).toBe(2);
      expect(await db.collection('lists').findOne({ name: 'Secret' })).not.toBeNull();
      expect(await db.collection('products').findOne({ name: 'Tea' })).toBeNull();
      expect(await db.collection('products').findOne({ name: 'Water' })).not.toBeNull();
      expect(await count('tickets')).toBe(1);
      expect(await count('transactions')).toBe(1);
      expect(await db.collection('daily_notes').findOne({ content: 'only B' })).toBeNull();
      expect(await db.collection('note_cards').findOne({ text: 'loose idea of B' })).toBeNull();
      expect(await db.collection('categories').findOne({ name: 'Mine' })).toBeNull();

      // Users and sessions are shared, and have no prefixed copy.
      expect(await count('users')).toBe(2);
      expect(await count('demo_users')).toBe(0);
    });
  });

  describe('scope outside a request', () => {
    it('throws without a scope and works inside runWithData', async () => {
      const data = scopedCollections();
      expect(() => data.lists).toThrow(/outside a signed-in request/);
      expect(() => data.tickets).toThrow();

      const own = getCollections(harness.database.db, 'demo_');
      const names = runWithData(own, () => ({
        lists: data.lists.collectionName,
        notes: data.dailyNotes.collectionName,
      }));
      expect(names).toEqual({ lists: 'demo_lists', notes: 'demo_daily_notes' });

      const count = await runWithData(own, () => data.lists.countDocuments());
      expect(count).toBe(1);
      // Leaving the scope closes it again.
      expect(() => data.lists).toThrow();
    });
  });

  it('a missing id is a 404 for both users', async () => {
    expect((await a.call('PATCH', `/lists/${MISSING_ID}`, { name: 'x' })).status).toBe(404);
    expect((await b.call('PATCH', `/lists/${MISSING_ID}`, { name: 'x' })).status).toBe(404);
  });
});
