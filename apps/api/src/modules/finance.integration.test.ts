import type { AccountSummary, Transaction } from '@rayrecords/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../test/harness';

const h = await createHarness();

const HEADER = 'Fecha operación;Concepto;Importe;Saldo';
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n');

describe.skipIf(!h)('cuentas, reglas, importación y resumen (integración)', () => {
  const { call } = h ?? ({} as Harness);
  let account: AccountSummary;

  const importCsv = async (
    body: string | Buffer,
    query = '',
    accountId = account.id,
  ): Promise<{ status: number; body: any }> => {
    const response = await h!.app.inject({
      method: 'POST',
      url: `/api/accounts/${accountId}/imports?fileName=extracto.csv${query}`,
      headers: { cookie: h!.cookie, 'content-type': 'text/csv' },
      payload: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    });
    return { status: response.statusCode, body: JSON.parse(response.body) };
  };

  const transactions = async (query = '') =>
    (await call('GET', `/transactions?${query}`)).body as { items: Transaction[]; total: number };

  beforeAll(async () => {
    for (const [key, name] of [
      ['supermercado', 'Supermercado'],
      ['ocio', 'Ocio'],
      ['ingresos', 'Ingresos'],
      ['traspaso', 'Traspasos'],
    ] as const) {
      await call('POST', '/categories', { key, name });
    }
    await call('POST', '/rules', {
      pattern: 'mercadona',
      matchType: 'contains',
      categoryKey: 'supermercado',
    });
    await call('POST', '/rules', {
      pattern: 'nomina',
      matchType: 'startsWith',
      categoryKey: 'ingresos',
    });
    const created = await call('POST', '/accounts', {
      name: 'Corriente',
      type: 'checking',
      openingBalanceCents: 100_000,
      openingDate: '2026-01-01',
    });
    expect(created.status).toBe(201);
    account = created.body;
  });

  afterAll(async () => {
    await h?.close();
  });

  describe('cuentas', () => {
    it('crea con saldo de apertura y lo calcula con los movimientos', async () => {
      expect(account).toMatchObject({
        balanceCents: 100_000,
        transactionCount: 0,
        archived: false,
      });
    });

    it('edita y archiva', async () => {
      const { body } = await call('POST', '/accounts', {
        name: 'Vieja',
        type: 'cash',
        openingDate: '2026-01-01',
      });
      expect(body.openingBalanceCents).toBe(0);
      const renamed = await call('PATCH', `/accounts/${body.id}`, {
        name: 'Efectivo',
        archived: true,
      });
      expect(renamed.body).toMatchObject({ name: 'Efectivo', archived: true });
      // Un PATCH parcial no reinicia la moneda ni el saldo inicial.
      const { body: funded } = await call('POST', '/accounts', {
        name: 'Con saldo',
        type: 'checking',
        currency: 'USD',
        openingBalanceCents: 12_345,
        openingDate: '2026-01-01',
      });
      const again = await call('PATCH', `/accounts/${funded.id}`, { name: 'Con saldo 2' });
      expect(again.body).toMatchObject({ currency: 'USD', openingBalanceCents: 12_345 });
      const active = (await call('GET', '/accounts')).body as AccountSummary[];
      expect(active.map((a) => a.id)).not.toContain(body.id);
      expect((await call('PATCH', `/accounts/${'a'.repeat(24)}`, { name: 'x' })).status).toBe(404);
    });
  });

  describe('categorías y reglas', () => {
    it('rechaza claves repetidas y no deja borrar una categoría en uso', async () => {
      const dup = await call('POST', '/categories', { key: 'ocio', name: 'Otra' });
      expect(dup.status).toBe(409);
      const used = await call('DELETE', '/categories/supermercado');
      expect(used.status).toBe(409);
      await call('POST', '/categories', { key: 'temporal', name: 'Temporal' });
      expect((await call('DELETE', '/categories/temporal')).status).toBe(204);
      expect((await call('DELETE', '/categories/temporal')).status).toBe(404);
    });

    it('valida la categoría y la expresión regular de una regla', async () => {
      const unknown = await call('POST', '/rules', {
        pattern: 'x',
        matchType: 'contains',
        categoryKey: 'noexiste',
      });
      expect(unknown.status).toBe(400);
      const badRegex = await call('POST', '/rules', {
        pattern: '(',
        matchType: 'regex',
        categoryKey: 'ocio',
      });
      expect(badRegex.status).toBe(400);
    });

    it('edita y borra reglas', async () => {
      const { body: rule } = await call('POST', '/rules', {
        pattern: 'cine',
        matchType: 'contains',
        categoryKey: 'ocio',
      });
      const patched = await call('PATCH', `/rules/${rule.id}`, { active: false, priority: 5 });
      expect(patched.body).toMatchObject({ active: false, priority: 5 });
      // Editar solo el patrón no reinicia la prioridad ni reactiva la regla.
      const renamed = await call('PATCH', `/rules/${rule.id}`, { pattern: 'cines' });
      expect(renamed.body).toMatchObject({ pattern: 'cines', active: false, priority: 5 });
      expect((await call('DELETE', `/rules/${rule.id}`)).status).toBe(204);
    });
  });

  describe('importación', () => {
    const first = csv(
      '03/11/2026;COMPRA MERCADONA 123;-45,67;1.054,33',
      '02/11/2026;NÓMINA EMPRESA;1.500,00;1.100,00',
      '02/11/2026;CAFE LA ESQUINA;-1,50;-400,00',
      '02/11/2026;CAFE LA ESQUINA;-1,50;-398,50',
    );
    let batchId: string;

    it('la vista previa no guarda nada', async () => {
      const { status, body } = await importCsv(first, '&dryRun=true');
      expect(status).toBe(200);
      expect(body).toMatchObject({ dryRun: true, parsed: 4, imported: 4, skipped: 0 });
      expect(body.uncategorized).toBe(2);
      expect(body.preview[0]).toMatchObject({ category: 'supermercado', duplicate: false });
      expect((await transactions()).total).toBe(0);
    });

    it('importa, categoriza con las reglas y actualiza el saldo', async () => {
      const { body } = await importCsv(first);
      expect(body).toMatchObject({ dryRun: false, imported: 4, skipped: 0 });
      batchId = body.batchId;

      const { items } = await transactions();
      expect(items).toHaveLength(4);
      expect(items.find((t) => t.description.includes('MERCADONA'))).toMatchObject({
        amountCents: -4567,
        category: 'supermercado',
        categorySource: 'rule',
        date: '2026-11-03',
      });
      const accounts = (await call('GET', '/accounts')).body as AccountSummary[];
      const current = accounts.find((a) => a.id === account.id)!;
      expect(current.transactionCount).toBe(4);
      expect(current.balanceCents).toBe(100_000 - 4567 + 150_000 - 150 - 150);
    });

    it('reimportar el mismo fichero no duplica (y conserva los dos cafés idénticos)', async () => {
      const { body } = await importCsv(first);
      expect(body).toMatchObject({ imported: 0, skipped: 4 });
      expect(body.batchId).toBeUndefined();
      expect((await transactions()).total).toBe(4);
    });

    it('un extracto solapado solo añade lo nuevo', async () => {
      const overlapping = csv(
        '04/11/2026;RECIBO LUZ;-60,10;938,23',
        '03/11/2026;COMPRA MERCADONA 123;-45,67;1.054,33',
        '02/11/2026;NÓMINA EMPRESA;1.500,00;1.100,00',
      );
      const { body } = await importCsv(overlapping);
      expect(body).toMatchObject({ parsed: 3, imported: 1, skipped: 2 });
      expect((await transactions()).total).toBe(5);
    });

    it('lee ficheros en Windows-1252', async () => {
      const latin1 = Buffer.from(csv('05/11/2026;CAFÉ ÑANDÚ;-2,00;936,23'), 'latin1');
      const { body } = await importCsv(latin1);
      expect(body.imported).toBe(1);
      const { items } = await transactions('q=nandu');
      expect(items[0]!.description).toBe('CAFÉ ÑANDÚ');
    });

    it('rechaza ficheros sin cabecera reconocible y cuentas inexistentes', async () => {
      const bad = await importCsv('uno;dos\n1;2');
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('invalid_csv');
      expect((await importCsv(first, '', 'a'.repeat(24))).status).toBe(404);
    });

    it('lista las importaciones y deshace una entera', async () => {
      const batches = (await call('GET', '/imports')).body as { id: string; imported: number }[];
      expect(batches.map((b) => b.id)).toContain(batchId);

      const before = (await transactions()).total;
      const undone = await call('DELETE', `/imports/${batchId}`);
      expect(undone.body).toEqual({ deleted: 4 });
      expect((await transactions()).total).toBe(before - 4);
      expect((await call('DELETE', `/imports/${batchId}`)).status).toBe(404);
    });
  });

  describe('movimientos y resumen', () => {
    beforeAll(async () => {
      await importCsv(
        csv(
          '10/10/2026;COMPRA MERCADONA;-100,00;1',
          '11/10/2026;COMPRA LIDL;-50,00;2',
          '12/10/2026;PAGO TARJETA RARO;-20,00;3',
          '13/10/2026;TRASPASO A AHORRO;-300,00;4',
          '14/10/2026;NOMINA OCTUBRE;1.000,00;5',
        ),
      );
    });

    it('filtra por mes, categoría, texto y pagina', async () => {
      expect((await transactions('month=2026-10')).total).toBe(5);
      expect((await transactions('month=2026-10&category=supermercado')).total).toBe(1);
      expect((await transactions('month=2026-10&category=none')).total).toBe(3);
      expect((await transactions('q=tarjeta')).items).toHaveLength(1);
      const page = await transactions('month=2026-10&limit=2&offset=0');
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(5);
      expect(page.items[0]!.date >= page.items[1]!.date).toBe(true); // más recientes primero
    });

    it('la corrección manual no se sobrescribe y puede crear una regla', async () => {
      const { items } = await transactions('q=tarjeta');
      const tx = items[0]!;
      const set = await call('PATCH', `/transactions/${tx.id}/category`, {
        category: 'ocio',
        createRule: true,
      });
      expect(set.body).toMatchObject({ category: 'ocio', categorySource: 'manual' });
      expect(
        (await call('PATCH', `/transactions/${tx.id}/category`, { category: 'nope' })).status,
      ).toBe(400);

      const rules = (await call('GET', '/rules')).body as { pattern: string; priority: number }[];
      expect(rules.some((r) => r.pattern === 'pago tarjeta raro' && r.priority === 10)).toBe(true);

      // Una regla nueva que también casaría con ese movimiento no lo toca al reaplicar.
      await call('POST', '/rules', {
        pattern: 'tarjeta',
        matchType: 'contains',
        categoryKey: 'supermercado',
      });
      await call('POST', '/rules/apply');
      expect((await transactions('q=tarjeta')).items[0]).toMatchObject({
        category: 'ocio',
        categorySource: 'manual',
      });
    });

    it('reaplicar reglas categoriza las que no tenían categoría', async () => {
      await call('POST', '/rules', {
        pattern: 'traspaso',
        matchType: 'startsWith',
        categoryKey: 'traspaso',
      });
      const applied = await call('POST', '/rules/apply');
      expect(applied.body.updated).toBeGreaterThanOrEqual(1);
      expect((await transactions('q=traspaso a ahorro')).items[0]).toMatchObject({
        category: 'traspaso',
        categorySource: 'rule',
      });
    });

    it('el resumen agrupa por mes y categoría y excluye los traspasos', async () => {
      const expense = (await call('GET', '/expenses/summary?from=2026-10&to=2026-10')).body;
      expect(expense).toEqual(
        expect.arrayContaining([
          { month: '2026-10', category: 'supermercado', totalCents: -10000, count: 1 },
          { month: '2026-10', category: null, totalCents: -5000, count: 1 },
          { month: '2026-10', category: 'ocio', totalCents: -2000, count: 1 },
        ]),
      );
      expect(expense.some((r: { category: string }) => r.category === 'traspaso')).toBe(false);

      const income = (await call('GET', '/expenses/summary?from=2026-10&to=2026-10&type=income'))
        .body;
      expect(income).toEqual([
        { month: '2026-10', category: 'ingresos', totalCents: 100000, count: 1 },
      ]);
    });
  });
});
