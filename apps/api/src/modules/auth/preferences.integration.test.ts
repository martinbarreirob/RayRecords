import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/harness';

// Its own file (and so its own app): the login rate limit of the auth suite is not spent here.
const h = await createHarness();

describe.skipIf(!h)('user preferences (integration)', () => {
  const { call } = h ?? ({} as Harness);

  afterAll(async () => {
    await h?.close();
  });

  it('uses the light theme until the user picks one', async () => {
    const me = await call('GET', '/auth/me');
    expect(me.body).toMatchObject({ username: 'martin', theme: 'light' });
  });

  it('saves the chosen theme in the account, for every session', async () => {
    const saved = await call('PATCH', '/auth/me', { theme: 'dark' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ username: 'martin', theme: 'dark' });
    expect((await call('GET', '/auth/me')).body).toMatchObject({ theme: 'dark' });

    // It is on the user, not on the session: a login from another device gets it too.
    const user = await h!.database.collections.users.findOne({ username: 'martin' });
    expect(user?.theme).toBe('dark');
    const login = await h!.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'martin', password: 'a long test password' },
    });
    expect(login.json()).toMatchObject({ theme: 'dark' });
  });

  it('still accepts the system theme saved by older accounts', async () => {
    const back = await call('PATCH', '/auth/me', { theme: 'system' });
    expect(back.body).toMatchObject({ theme: 'system' });
  });

  it('rejects a theme that does not exist and a request without a session', async () => {
    expect((await call('PATCH', '/auth/me', { theme: 'sepia' })).status).toBe(400);
    const anonymous = await h!.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      payload: { theme: 'dark' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});
