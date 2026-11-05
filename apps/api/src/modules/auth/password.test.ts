import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('contraseñas', () => {
  it('verifica la correcta y rechaza la incorrecta', async () => {
    const hash = await hashPassword('una contraseña larga');
    expect(await verifyPassword('una contraseña larga', hash)).toBe(true);
    expect(await verifyPassword('otra contraseña', hash)).toBe(false);
  });

  it('usa sal: la misma contraseña da hashes distintos', async () => {
    const [a, b] = await Promise.all([hashPassword('misma'), hashPassword('misma')]);
    expect(a).not.toBe(b);
  });

  it('un hash con formato desconocido no verifica', async () => {
    expect(await verifyPassword('x', 'plano')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
