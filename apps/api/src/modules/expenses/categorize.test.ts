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
  it('a rule using the merchant key matches even if it is not a literal substring of the description', () => {
    // The key of "acme - town 2 \town\es..." is "acme town 2" (no dash).
    const description = 'acme - town 2 \town\es2408292044';
    expect(categorize(description, [rule('acme town 2', 'supermercado')])).toBe('supermercado');
  });

  it('the highest priority wins and inactive rules are ignored', () => {
    const rules = [
      rule('acme', 'supermercado'),
      rule('acme', 'ocio', 10),
      { ...rule('acme', 'otros', 99), active: false },
    ];
    expect(categorize('acme town 1', rules)).toBe('ocio');
    expect(categorize('otra cosa', rules)).toBeNull();
  });
});
