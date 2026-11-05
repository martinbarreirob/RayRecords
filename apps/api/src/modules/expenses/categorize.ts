import type { CategorizationRule } from '@rayrecords/shared';
import { merchantKey } from './merchant';
import { normalizeDescription } from './normalize';

export type Rule = Pick<
  CategorizationRule,
  'pattern' | 'matchType' | 'categoryKey' | 'priority' | 'active'
>;

/**
 * `contains` también se prueba contra la clave de comercio: las reglas que crea la revisión usan esa
 * clave como patrón, y la clave no siempre es una subcadena literal de la descripción
 * (`froiz - cangas 2` → `froiz cangas 2`).
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
  const key = merchantKey(descriptionNorm) ?? '';
  const ordered = rules.filter((r) => r.active).sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (matches(descriptionNorm, key, rule)) return rule.categoryKey;
  }
  return null;
}
