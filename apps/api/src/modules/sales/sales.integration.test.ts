import type { Product, ProductSales, Ticket } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/harness';

const h = await createHarness();

describe.skipIf(!h)('sales (integration)', () => {
  const { call } = h ?? ({} as Harness);

  afterAll(async () => {
    await h?.close();
  });

  const create = async (name: string, quantity: number, priceCents: number, costCents = 0) =>
    (await call('POST', '/stock/products', { name, quantity, priceCents, costCents }))
      .body as Product;

  const quantityOf = async (id: string) =>
    ((await call('GET', '/stock/products')).body as Product[]).find((p) => p.id === id)?.quantity;

  it('creates a numbered ticket, copies name and price and takes the units out', async () => {
    const water = await create('Agua', 10, 60, 25);
    const coffee = await create('Café', 5, 350, 180);

    const first = await call('POST', '/tickets', {
      lines: [
        { productId: water.id, quantity: 3 },
        { productId: coffee.id, quantity: 1 },
      ],
    });
    expect(first.status).toBe(201);
    const ticket = first.body as Ticket;
    expect(ticket.number).toBe(1);
    expect(ticket.totalCents).toBe(3 * 60 + 350);
    expect(ticket.lines).toEqual([
      { productId: water.id, name: 'Agua', quantity: 3, unitPriceCents: 60, unitCostCents: 25 },
      { productId: coffee.id, name: 'Café', quantity: 1, unitPriceCents: 350, unitCostCents: 180 },
    ]);
    expect(await quantityOf(water.id)).toBe(7);
    expect(await quantityOf(coffee.id)).toBe(4);

    const second = await call('POST', '/tickets', {
      lines: [{ productId: water.id, quantity: 1 }],
    });
    expect(second.body.number).toBe(2);

    // A later price change does not rewrite the ticket.
    await call('PATCH', `/stock/products/${water.id}`, { priceCents: 99, costCents: 70 });
    const list = (await call('GET', '/tickets')).body as Ticket[];
    expect(list.map((t) => t.number)).toEqual([2, 1]);
    expect(list[1]?.lines[0]?.unitPriceCents).toBe(60);
    expect(list[1]?.lines[0]?.unitCostCents).toBe(25);
  });

  it('adds up a product repeated on several lines', async () => {
    const product = await create('Pilas', 10, 500);
    const { body } = await call('POST', '/tickets', {
      lines: [
        { productId: product.id, quantity: 2 },
        { productId: product.id, quantity: 3 },
      ],
    });
    expect(body.lines).toEqual([
      { productId: product.id, name: 'Pilas', quantity: 5, unitPriceCents: 500, unitCostCents: 0 },
    ]);
    expect(await quantityOf(product.id)).toBe(5);
  });

  it('refuses a sale with too little stock and puts back what it had taken', async () => {
    const plenty = await create('Patatas', 10, 150);
    const scarce = await create('Zumo', 1, 189);
    const before = ((await call('GET', '/tickets')).body as Ticket[]).length;

    const response = await call('POST', '/tickets', {
      lines: [
        { productId: plenty.id, quantity: 4 },
        { productId: scarce.id, quantity: 2 },
      ],
    });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('Zumo');
    expect(await quantityOf(plenty.id)).toBe(10);
    expect(await quantityOf(scarce.id)).toBe(1);
    expect(((await call('GET', '/tickets')).body as Ticket[]).length).toBe(before);
  });

  it('rejects an empty cart, a bad quantity and a product that is gone', async () => {
    const product = await create('Efímero', 3, 100);
    expect((await call('POST', '/tickets', { lines: [] })).status).toBe(400);
    expect(
      (await call('POST', '/tickets', { lines: [{ productId: product.id, quantity: 0 }] })).status,
    ).toBe(400);
    await call('DELETE', `/stock/products/${product.id}`);
    expect(
      (await call('POST', '/tickets', { lines: [{ productId: product.id, quantity: 1 }] })).status,
    ).toBe(400);
  });

  it('gives consecutive numbers to sales made at the same time', async () => {
    const product = await create('Bolígrafo', 50, 45);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        call('POST', '/tickets', { lines: [{ productId: product.id, quantity: 1 }] }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const numbers = responses.map((r) => r.body.number as number);
    expect(new Set(numbers).size).toBe(4);
    expect(await quantityOf(product.id)).toBe(46);
  });

  it('filters the tickets by day, in the app time zone and with both ends included', async () => {
    // 23:30 UTC on the 9th is already the 10th in Madrid; 22:59 UTC on the 11th is still the 11th.
    const at = (number: number, iso: string) => ({
      _id: new ObjectId(),
      number,
      lines: [],
      totalCents: 0,
      createdAt: new Date(iso),
    });
    await h!.database.collections.tickets.insertMany([
      at(9001, '2020-03-09T22:59:00.000Z'),
      at(9002, '2020-03-09T23:30:00.000Z'),
      at(9003, '2020-03-11T22:59:00.000Z'),
      at(9004, '2020-03-11T23:00:00.000Z'),
    ]);
    const numbers = async (query: string) =>
      ((await call('GET', `/tickets?${query}`)).body as Ticket[]).map((t) => t.number);

    expect(await numbers('from=2020-03-10&to=2020-03-11')).toEqual([9003, 9002]);
    expect(await numbers('from=2020-03-12&to=2020-03-12')).toEqual([9004]);
    expect(await numbers('to=2020-03-09')).toEqual([9001]);
    const open = await numbers('from=2020-03-12');
    expect(open).toContain(9004);
    expect(open).not.toContain(9003);
    expect((await call('GET', '/tickets?from=ayer')).status).toBe(400);
    await h!.database.collections.tickets.deleteMany({ number: { $gte: 9000 } });
  });

  it('ranks products by units sold', async () => {
    const top = await create('Refresco', 100, 75);
    await call('POST', '/tickets', { lines: [{ productId: top.id, quantity: 40 }] });
    const ranking = (await call('GET', '/sales/top-products')).body as ProductSales[];
    expect(ranking[0]).toEqual({ productId: top.id, units: 40 });
    const units = ranking.map((row) => row.units);
    expect(units).toEqual([...units].sort((a, b) => b - a));
  });
});
