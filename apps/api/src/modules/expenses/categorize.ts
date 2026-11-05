import type { CategorizationRule } from '@rayrecords/shared';
import { merchantKey } from './merchant';
import { normalizeDescription } from './normalize';

export type Rule = Pick<
  CategorizationRule,
  'pattern' | 'matchType' | 'categoryKey' | 'priority' | 'active'
>;

/**
 * `contains` is also tested against the merchant key: rules created from the review queue use that
 * key as the pattern, and the key is not always a literal substring of the description
 * (`acme - town 2` becomes `acme town 2`).
 */
function matches(descriptionNorm: string, key: string, rule: Rule): boolean {
  switch (rule.matchType) {
    case 'contains': {
      const pattern = normalizeDescription(rule.pattern);
      return descriptionNorm.includes(pattern) || key.includes(pattern);
    }
    case 'startsWith':
      return descriptionNorm.startsWith(normalizeDescription(rule.pattern));
    case 'regex':
      try {
        // The description is already normalized, so patterns are written without accents or capitals.
        return new RegExp(rule.pattern, 'i').test(descriptionNorm);
      } catch {
        return false; // one invalid regex must not break the whole import
      }
  }
}

/**
 * Returns the category of the first matching active rule, highest priority first (on equal
 * priority the earlier one wins), or `null` if none applies.
 */
export function categorize(descriptionNorm: string, rules: readonly Rule[]): string | null {
  const key = merchantKey(descriptionNorm) ?? '';
  const ordered = rules.filter((r) => r.active).sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (matches(descriptionNorm, key, rule)) return rule.categoryKey;
  }
  return null;
}
