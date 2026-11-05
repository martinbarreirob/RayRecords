import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('passwords', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('a long password');
    expect(await verifyPassword('a long password', hash)).toBe(true);
    expect(await verifyPassword('another password', hash)).toBe(false);
  });

  it('uses a salt: the same password gives different hashes', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('a hash in an unknown format does not verify', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
