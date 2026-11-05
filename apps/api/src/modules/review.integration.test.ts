import type { AccountSummary, ReviewQueue } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/harness';

const h = await createHarness();

const HEADER = 'Data,Concepto,Saldo,Importe,Data operación,Data valor';
const line = (date: string, concept: string, amount: string) =>
  `${date},${concept},0.0 €,${amount} €,${date},${date}`;

describe.skipIf(!h)('cola de revisión (integración)', () => {
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

  it('agrupa lo pendiente por comercio y ordena por importe', async () => {
    await importCsv(
      line('01-09-2026', 'CAFE LA PLAYA     \CANGAS\ES2609010900', '-2.5'),
      line('02-09-2026', 'CAFE LA PLAYA     \CANGAS\ES2609021000', '-3.0'),
      line('03-09-2026', 'CAFE LA PLAYA     \CANGAS\ES2609031100', '-2.7700000000000005'),
      line('04-09-2026', 'CONCIERTO ARENA   \VIGO\ES2609041200', '-60.0'),
    );
    const q = await queue();
    expect(q.pendingTransactions).toBe(4);
    expect(q.pendingGroups).toBe(2);
    expect(q.groups.map((g) => g.merchantKey)).toEqual(['concierto arena', 'cafe la playa']);
    expect(q.groups[1]).toMatchObject({ count: 3, totalCents: -827 });
    expect(q.groups[1]!.suggestions.map((s) => s.category)).toContain('restauracion');
  });

  it('aplica a todo el grupo, crea la regla y la próxima importación llega categorizada', async () => {
    const group = (await queue()).groups.find((g) => g.merchantKey === 'cafe la playa')!;
    const applied = await call('POST', '/review/apply', {
      ids: group.ids,
      category: 'restauracion',
    });
    expect(applied.body).toMatchObject({ updated: 3, ruleSkippedReason: null });
    expect(applied.body.ruleId).toBeTruthy();
    expect((await queue()).pendingTransactions).toBe(1);

    await importCsv(line('10-09-2026', 'CAFE LA PLAYA     \CANGAS\ES2609101000', '-2.8'));
    const q = await queue();
    expect(q.pendingTransactions).toBe(1); // el café nuevo no queda pendiente: lo resolvió la regla
  });

  it('deshacer devuelve el grupo a pendientes y borra la regla', async () => {
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

  it('no crea regla si los importes son muy dispares', async () => {
    await importCsv(
      line('11-09-2026', 'TIENDA MIXTA      \CANGAS\ES2609111000', '-1.0'),
      line('12-09-2026', 'TIENDA MIXTA      \CANGAS\ES2609121000', '-80.0'),
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

  it('añade categorías y reglas, rellena la clave de comercio y es idempotente', async () => {
    const { syncCatalog } = await import('./expenses/catalog-sync');
    const c = h!.app.db.collections;
    const first = await syncCatalog(c);
    expect(first.categoriesAdded).toBeGreaterThan(5);
    expect(first.rulesAdded).toBeGreaterThan(50);
    const second = await syncCatalog(c);
    expect(second).toMatchObject({ categoriesAdded: 0, rulesAdded: 0, merchantKeysFilled: 0 });
    expect(await c.rules.countDocuments({ pattern: 'froiz' })).toBe(1);
  });

  it('migra las categorías antiguas a las nuevas y manda a revisión las que no tienen sustituta', async () => {
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
      line('20-09-2026', 'ZZMARKET CENTRO   \CANGAS\ES2609201000', '-10.0'),
      line('21-09-2026', 'COSA RARA         \CANGAS\ES2609211000', '-5.0'),
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
