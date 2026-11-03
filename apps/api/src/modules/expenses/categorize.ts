import type { CategorizationRule } from '@rayrecords/shared';
import { normalizeDescription } from './normalize';

export type Rule = Pick<
  CategorizationRule,
  'pattern' | 'matchType' | 'categoryKey' | 'priority' | 'active'
>;

function matches(descriptionNorm: string, rule: Rule): boolean {
  switch (rule.matchType) {
    case 'contains':
      return descriptionNorm.includes(normalizeDescription(rule.pattern));
    case 'startsWith':
      return descriptionNorm.startsWith(normalizeDescription(rule.pattern));
    case 'regex':
      try {
        // La descripción ya está normalizada, así que el patrón se escribe sin acentos ni mayúsculas.
        return new RegExp(rule.pattern, 'i').test(descriptionNorm);
      } catch {
        return false; // una regex inválida no debe romper la importación entera
      }
  }
}

/**
 * Devuelve la categoría de la primera regla activa que coincide, de mayor a menor prioridad
 * (a igual prioridad, gana la que va antes), o `null` si ninguna aplica.
 */
export function categorize(descriptionNorm: string, rules: readonly Rule[]): string | null {
  const ordered = rules.filter((r) => r.active).sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (matches(descriptionNorm, rule)) return rule.categoryKey;
  }
  return null;
}
