import type { Product, StockCategory } from '@rayrecords/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/harness';
import { categoryNameKey } from './routes';

const h = await createHarness();

describe('categoryNameKey', () => {
  it('ignores accents, capitals and outer spaces', () => {
    expect(categoryNameKey('  Bébidas ')).toBe('bebidas');
  });
});

describe.skipIf(!h)('stock (integration)', () => {
  const { call } = h ?? ({} as Harness);

  afterAll(async () => {
    await h?.close();
  });

  const createCategory = async (name: string) =>
    (await call('POST', '/stock/categories', { name })).body as StockCategory;

  describe('categories', () => {
    it('creates, lists by name and renames', async () => {
      const drinks = await createCategory('Refrescos');
      await createCategory('Aperitivos');
      const list = (await call('GET', '/stock/categories')).body as StockCategory[];
      expect(list.map((category) => category.name)).toEqual(['Aperitivos', 'Refrescos']);

      const renamed = await call('PATCH', `/stock/categories/${drinks.id}`, { name: 'Bebidas' });
      expect(renamed.body).toMatchObject({ id: drinks.id, name: 'Bebidas' });
    });

    it('gives a new category the default look and saves a chosen one', async () => {
      const plain = await createCategory('Sin aspecto');
      expect(plain).toMatchObject({ icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' });

      const styled = await call('POST', '/stock/categories', {
        name: 'Con aspecto',
        icon: 'crown',
        color: '#FDE2E8',
        iconColor: '#be123c',
      });
      expect(styled.status).toBe(201);
      expect(styled.body).toMatchObject({ icon: 'crown', color: '#fde2e8', iconColor: '#be123c' });
    });

    it('changes the look without touching the name, and the name without the look', async () => {
      const category = await createCategory('Editable');
      const recolored = await call('PATCH', `/stock/categories/${category.id}`, {
        icon: 'gift',
        color: '#1d4fb8',
      });
      expect(recolored.body).toMatchObject({
        name: 'Editable',
        icon: 'gift',
        color: '#1d4fb8',
        iconColor: '#2b2b2b',
      });
      const renamed = await call('PATCH', `/stock/categories/${category.id}`, { name: 'Editada' });
      expect(renamed.body).toMatchObject({ name: 'Editada', icon: 'gift', color: '#1d4fb8' });
      const untouched = await call('PATCH', `/stock/categories/${category.id}`, {});
      expect(untouched.body).toMatchObject({ name: 'Editada', icon: 'gift' });
    });

    it('rejects an icon that is not on the list and a color that is not hex', async () => {
      const badIcon = await call('POST', '/stock/categories', { name: 'Icono', icon: 'rocket' });
      expect(badIcon.status).toBe(400);
      const badColor = await call('POST', '/stock/categories', { name: 'Color', color: 'red' });
      expect(badColor.status).toBe(400);
    });

    it('rejects a name that only differs in accents or capitals', async () => {
      await createCategory('Limpieza');
      expect((await call('POST', '/stock/categories', { name: 'LIMPIEZÁ' })).status).toBe(409);
      const other = await createCategory('Papelería');
      const clash = await call('PATCH', `/stock/categories/${other.id}`, { name: 'limpieza' });
      expect(clash.status).toBe(409);
    });

    it('answers 404 for a category that does not exist', async () => {
      const id = 'a'.repeat(24);
      expect((await call('PATCH', `/stock/categories/${id}`, { name: 'Nada' })).status).toBe(404);
      expect((await call('DELETE', `/stock/categories/${id}`)).status).toBe(404);
    });

    it('deleting one leaves its products without a category', async () => {
      const category = await createCategory('Temporal');
      const { body: product } = await call('POST', '/stock/products', {
        name: 'Producto temporal',
        categoryId: category.id,
      });
      expect((await call('DELETE', `/stock/categories/${category.id}`)).status).toBe(204);
      const products = (await call('GET', '/stock/products')).body as Product[];
      expect(products.find((p) => p.id === product.id)?.categoryId).toBeNull();
    });
  });

  describe('products', () => {
    it('creates with defaults and lists by name', async () => {
      const created = await call('POST', '/stock/products', { name: 'Zumo de naranja' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Zumo de naranja',
        categoryId: null,
        quantity: 0,
        minQuantity: 0,
        priceCents: 0,
        costCents: 0,
      });
      expect(created.body.sku).toBeUndefined();

      await call('POST', '/stock/products', { name: 'agua mineral', quantity: 24 });
      const names = ((await call('GET', '/stock/products')).body as Product[]).map((p) => p.name);
      expect(names.indexOf('agua mineral')).toBeLessThan(names.indexOf('Zumo de naranja'));
    });

    it('rejects a category that does not exist and invalid amounts', async () => {
      const missing = await call('POST', '/stock/products', {
        name: 'Huérfano',
        categoryId: 'b'.repeat(24),
      });
      expect(missing.status).toBe(400);
      expect((await call('POST', '/stock/products', { name: 'X', quantity: -1 })).status).toBe(400);
      expect((await call('POST', '/stock/products', { name: 'X', priceCents: 1.5 })).status).toBe(
        400,
      );
      expect((await call('POST', '/stock/products', { name: 'X', costCents: -1 })).status).toBe(
        400,
      );
    });

    it('updates the unit cost on its own and reads a product saved without one as cost 0', async () => {
      const { body: product } = await call('POST', '/stock/products', {
        name: 'Té',
        priceCents: 300,
      });
      const priced = await call('PATCH', `/stock/products/${product.id}`, { costCents: 120 });
      expect(priced.body).toMatchObject({ priceCents: 300, costCents: 120 });
    });

    it('a partial update keeps the rest, and null clears sku and notes', async () => {
      const category = await createCategory('Conservas');
      const { body: product } = await call('POST', '/stock/products', {
        name: 'Atún',
        sku: 'AT-01',
        categoryId: category.id,
        quantity: 10,
        minQuantity: 3,
        priceCents: 250,
        costCents: 140,
        notes: 'Pack de tres',
      });

      const sold = await call('PATCH', `/stock/products/${product.id}`, { quantity: 2 });
      expect(sold.body).toMatchObject({
        quantity: 2,
        minQuantity: 3,
        priceCents: 250,
        costCents: 140,
        sku: 'AT-01',
        categoryId: category.id,
      });

      const cleared = await call('PATCH', `/stock/products/${product.id}`, {
        sku: null,
        notes: null,
        categoryId: null,
      });
      expect(cleared.body.sku).toBeUndefined();
      expect(cleared.body.notes).toBeUndefined();
      expect(cleared.body.categoryId).toBeNull();
    });

    it('deletes, and answers 404 afterwards', async () => {
      const { body: product } = await call('POST', '/stock/products', { name: 'Efímero' });
      expect((await call('DELETE', `/stock/products/${product.id}`)).status).toBe(204);
      expect((await call('DELETE', `/stock/products/${product.id}`)).status).toBe(404);
      expect((await call('PATCH', `/stock/products/${product.id}`, { quantity: 1 })).status).toBe(
        404,
      );
    });
  });
});
