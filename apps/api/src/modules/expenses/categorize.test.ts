import { describe, expect, it } from 'vitest';
import { categorize, type Rule } from './categorize';

const rule = (pattern: string, categoryKey: string, priority = 0): Rule => ({
  pattern,
  matchType: 'contains',
  categoryKey,
  priority,
  active: true,
});

describe('categorize', () => {
  it('una regla con la clave de comercio casa aunque no sea subcadena literal de la descripción', () => {
    // La clave de «froiz - cangas 2 \cangas\es…» es «froiz cangas 2» (sin guion).
    const description = 'froiz - cangas 2 \cangas\es2408292044';
    expect(categorize(description, [rule('froiz cangas 2', 'supermercado')])).toBe('supermercado');
  });

  it('gana la de mayor prioridad y se ignoran las inactivas', () => {
    const rules = [
      rule('froiz', 'supermercado'),
      rule('froiz', 'ocio', 10),
      { ...rule('froiz', 'otros', 99), active: false },
    ];
    expect(categorize('froiz cangas 1', rules)).toBe('ocio');
    expect(categorize('otra cosa', rules)).toBeNull();
  });
});
