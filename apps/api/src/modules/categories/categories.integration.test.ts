import type { Category } from '@rayrecords/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/harness';

// Its own app, apart from the finance suite, so each one has a database of its own.
const h = await createHarness();

describe.skipIf(!h)('expense categories (integration)', () => {
  const { call } = h ?? ({} as Harness);

  afterAll(async () => {
    await h?.close();
  });

  const list = async () => (await call('GET', '/categories')).body as Category[];

  it('gives a new category the default look and makes its key from the name', async () => {
    const created = await call('POST', '/categories', { name: 'Ocio y cultura' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      key: 'ocio_y_cultura',
      name: 'Ocio y cultura',
      icon: 'tag',
      color: '#ededed',
      iconColor: '#2b2b2b',
    });
  });

  it('saves the chosen icon and colors, and an explicit key', async () => {
    const created = await call('POST', '/categories', {
      key: 'mascotas',
      name: 'Mascotas',
      icon: 'dog',
      color: '#FDECC8',
      iconColor: '#b45309',
    });
    expect(created.body).toMatchObject({
      key: 'mascotas',
      icon: 'dog',
      color: '#fdecc8',
      iconColor: '#b45309',
    });
  });

  it('numbers the key when the name makes one that is taken', async () => {
    const first = await call('POST', '/categories', { name: 'Viajes' });
    expect(first.body.key).toBe('viajes');
    // A different name that makes the same key once accents and signs are gone.
    const second = await call('POST', '/categories', { name: 'Viájes!' });
    expect(second.status).toBe(201);
    expect(second.body.key).toBe('viajes_2');
    const third = await call('POST', '/categories', { name: 'Viajes ?' });
    expect(third.body.key).toBe('viajes_3');
    // An explicit key that is taken is a conflict, not renumbered.
    const clash = await call('POST', '/categories', { key: 'viajes', name: 'Otro nombre' });
    expect(clash.status).toBe(409);
  });

  it('rejects a name that only differs in accents or capitals', async () => {
    await call('POST', '/categories', { name: 'Educación' });
    expect((await call('POST', '/categories', { name: 'EDUCACION' })).status).toBe(409);
    const other = (await call('POST', '/categories', { name: 'Formación' })).body as Category;
    const clash = await call('PATCH', `/categories/${other.key}`, { name: 'educación' });
    expect(clash.status).toBe(409);
    // Keeping its own name, in other capitals, is not a clash.
    const same = await call('PATCH', `/categories/${other.key}`, { name: 'FORMACIÓN' });
    expect(same.status).toBe(200);
  });

  it('rejects an icon that is not on the list and a color that is not hex', async () => {
    expect((await call('POST', '/categories', { name: 'Raro', icon: 'rocket' })).status).toBe(400);
    expect((await call('POST', '/categories', { name: 'Rojo', color: 'red' })).status).toBe(400);
  });

  it('changes the look without touching the name, and the name without the look', async () => {
    const category = (await call('POST', '/categories', { name: 'Gimnasio' })).body as Category;
    const styled = await call('PATCH', `/categories/${category.key}`, {
      icon: 'run',
      color: '#d9f2ee',
    });
    expect(styled.body).toMatchObject({
      name: 'Gimnasio',
      icon: 'run',
      color: '#d9f2ee',
      iconColor: '#2b2b2b',
    });
    const renamed = await call('PATCH', `/categories/${category.key}`, { name: 'Deporte' });
    expect(renamed.body).toMatchObject({ key: category.key, name: 'Deporte', icon: 'run' });
    expect((await call('PATCH', '/categories/no_existe', { name: 'X' })).status).toBe(404);
  });

  it('shows a category saved before categories had a look with the default one', async () => {
    await h!.database.collections.categories.insertOne({
      _id: 'antigua',
      name: 'Antigua',
      color: '#3b6fe0',
    });
    const old = (await list()).find((category) => category.key === 'antigua');
    expect(old).toMatchObject({ icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' });

    // The first change settles a whole look, so no part stays undefined.
    const changed = await call('PATCH', '/categories/antigua', { icon: 'car' });
    expect(changed.body).toMatchObject({ icon: 'car', color: '#ededed', iconColor: '#2b2b2b' });
    const stored = await h!.database.collections.categories.findOne({ _id: 'antigua' });
    expect(stored).toMatchObject({ icon: 'car', color: '#ededed', iconColor: '#2b2b2b' });
  });

  it('counts the transactions of each category, leaving out the empty ones', async () => {
    const account = (
      await call('POST', '/accounts', {
        name: 'Cuenta',
        type: 'checking',
        openingDate: '2026-01-01',
      })
    ).body;
    const csv = ['Fecha operación;Concepto;Importe;Saldo', '05/11/2026;COMPRA UNO;-10,00;100,00']
      .concat('06/11/2026;COMPRA DOS;-5,00;95,00', '07/11/2026;COMPRA TRES;-2,00;93,00')
      .join('\n');
    const imported = await h!.app.inject({
      method: 'POST',
      url: `/api/accounts/${account.id}/imports?fileName=extracto.csv`,
      headers: { cookie: h!.cookie, 'content-type': 'text/csv' },
      payload: Buffer.from(csv, 'utf8'),
    });
    expect(imported.statusCode).toBe(200);
    const items = (await call('GET', '/transactions?limit=10')).body.items as { id: string }[];
    await call('PATCH', `/transactions/${items[0]!.id}/category`, { category: 'mascotas' });
    await call('PATCH', `/transactions/${items[1]!.id}/category`, { category: 'mascotas' });
    await call('PATCH', `/transactions/${items[2]!.id}/category`, { category: 'viajes' });

    const usage = (await call('GET', '/categories/usage')).body;
    expect(usage).toEqual({ mascotas: 2, viajes: 1 });
    // A category in use cannot be deleted; one without movements can.
    expect((await call('DELETE', '/categories/mascotas')).status).toBe(409);
    expect((await call('DELETE', '/categories/antigua')).status).toBe(204);
  });
});
