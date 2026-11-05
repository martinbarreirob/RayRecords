import type { AccountSummary, ReviewQueue } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/harness';

const h = await createHarness();

const HEADER = 'Data,Concepto,Saldo,Importe,Data operación,Data valor';
const line = (date: string, concept: string, amount: string) =>
  `${date},${concept},0.0 €,${amount} €,${date},${date}`;

describe.skipIf(!h)('review queue (integration)', () => {
  const { call } = h ?? ({} as Harness);
  let account: AccountSummary;

  const importCsv = async (...lines: string[]) => {
    const response = await h!.app.inject({
      method: 'POST',
      url: `/api/accounts/${account.id}/imports?fileName=extracto.csv`,
      headers: { cookie: h!.cookie, 'content-type': 'text/csv' },
      payload: Buffer.from([HEADER, ...lines].join('\n'), 'utf8'),
    });
    expect(response.statusCode).toBe(200);
  };
  const queue = async () => (await call('GET', '/review/queue?limit=20')).body as ReviewQueue;

  beforeAll(async () => {
    for (const [key, name] of [
      ['restauracion', 'Restauración'],
      ['ocio', 'Ocio'],
    ] as const) {
      await call('POST', '/categories', { key, name });
    }
    account = (
      await call('POST', '/accounts', {
        name: 'Corriente',
        type: 'checking',
        openingBalanceCents: 0,
        openingDate: '2024-01-01',
      })
    ).body;
  });

  afterAll(async () => {
    await h?.close();
  });

  it('groups pending items by merchant and sorts by amount', async () => {
    await importCsv(
      line('01-09-2026', 'CAFE LA PLAYA     \TOWN\ES2609010900', '-2.5'),
      line('02-09-2026', 'CAFE LA PLAYA     \TOWN\ES2609021000', '-3.0'),
      line('03-09-2026', 'CAFE LA PLAYA     \TOWN\ES2609031100', '-2.7700000000000005'),
      line('04-09-2026', 'CONCIERTO ARENA   \VIGO\ES2609041200', '-60.0'),
    );
    const q = await queue();
    expect(q.pendingTransactions).toBe(4);
    expect(q.pendingGroups).toBe(2);
    expect(q.groups.map((g) => g.merchantKey)).toEqual(['concierto arena', 'cafe la playa']);
    expect(q.groups[1]).toMatchObject({ count: 3, totalCents: -827 });
    expect(q.groups[1]!.suggestions.map((s) => s.category)).toContain('restauracion');
  });

  it('applies to the whole group, creates the rule and the next import arrives categorized', async () => {
    const group = (await queue()).groups.find((g) => g.merchantKey === 'cafe la playa')!;
    const applied = await call('POST', '/review/apply', {
      ids: group.ids,
      category: 'restauracion',
    });
    expect(applied.body).toMatchObject({ updated: 3, ruleSkippedReason: null });
    expect(applied.body.ruleId).toBeTruthy();
    expect((await queue()).pendingTransactions).toBe(1);

    await importCsv(line('10-09-2026', 'CAFE LA PLAYA     \TOWN\ES2609101000', '-2.8'));
    const q = await queue();
    expect(q.pendingTransactions).toBe(1); // the new coffee is not pending: the rule resolved it
  });

  it('undo puts the group back to pending and deletes the rule', async () => {
    const group = (await queue()).groups[0]!;
    const applied = await call('POST', '/review/apply', {
      ids: group.ids,
      category: 'ocio',
    });
    expect(applied.body.ruleSkippedReason).toBe('Un solo movimiento: aún no hay patrón');
    const undone = await call('POST', '/review/undo', { ids: group.ids, ruleId: null });
    expect(undone.body.reverted).toBe(1);
    expect((await queue()).pendingTransactions).toBe(1);
  });

  it('does not create a rule when amounts differ a lot', async () => {
    await importCsv(
      line('11-09-2026', 'TIENDA MIXTA      \TOWN\ES2609111000', '-1.0'),
      line('12-09-2026', 'TIENDA MIXTA      \TOWN\ES2609121000', '-80.0'),
    );
    const group = (await queue()).groups.find((g) => g.merchantKey === 'tienda mixta')!;
    const applied = await call('POST', '/review/apply', {
      ids: group.ids,
      category: 'ocio',
    });
    expect(applied.body).toMatchObject({
      updated: 2,
      ruleId: null,
      ruleSkippedReason: 'Los importes varían demasiado para generalizar',
    });
  });

  it('adds categories and rules, fills the merchant key and is idempotent', async () => {
    const { syncCatalog } = await import('./expenses/catalog-sync');
    const c = h!.app.db.collections;
    const first = await syncCatalog(c);
    expect(first.categoriesAdded).toBeGreaterThan(5);
    expect(first.rulesAdded).toBeGreaterThan(50);
    const second = await syncCatalog(c);
    expect(second).toMatchObject({ categoriesAdded: 0, rulesAdded: 0, merchantKeysFilled: 0 });
    expect(await c.rules.countDocuments({ pattern: 'froiz' })).toBe(1);
  });

  it('migrates old categories to the new ones and sends those without a replacement to review', async () => {
    const { syncCatalog } = await import('./expenses/catalog-sync');
    const c = h!.app.db.collections;
    for (const [key, name] of [
      ['supermercado', 'Supermercado'],
      ['familia', 'Familia'],
    ] as const) {
      await call('POST', '/categories', { key, name });
    }
    await call('POST', '/rules', {
      pattern: 'zzmarket',
      categoryKey: 'supermercado',
      matchType: 'contains',
    });
    await importCsv(
      line('20-09-2026', 'ZZMARKET CENTRO   \TOWN\ES2609201000', '-10.0'),
      line('21-09-2026', 'COSA RARA         \TOWN\ES2609211000', '-5.0'),
    );
    const rare = (await queue()).groups.find((g) => g.merchantKey === 'cosa rara')!;
    await call('POST', '/review/apply', { ids: rare.ids, category: 'familia', createRule: false });

    const result = await syncCatalog(c);
    expect(result.migrated).toBeGreaterThanOrEqual(3);
    expect(
      await c.transactions.countDocuments({ category: 'hogar', merchantKey: 'zzmarket centro' }),
    ).toBe(1);
    expect(await c.rules.countDocuments({ pattern: 'zzmarket', categoryKey: 'hogar' })).toBe(1);
    expect(await c.categories.countDocuments({ _id: { $in: ['supermercado', 'familia'] } })).toBe(
      0,
    );
    expect((await queue()).groups.some((g) => g.merchantKey === 'cosa rara')).toBe(true);
  });
});
