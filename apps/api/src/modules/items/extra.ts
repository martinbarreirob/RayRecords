import { isValidDateOnly, type Extra, type FieldDef } from '@rayrecords/shared';

export interface ExtraIssue {
  path: string;
  message: string;
}

function checkValue(def: FieldDef, value: string | number | boolean): string | null {
  switch (def.type) {
    case 'text':
      return typeof value === 'string' ? null : 'Debe ser texto';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'Debe ser un número';
    case 'money':
      return Number.isInteger(value) ? null : 'Debe ser un importe en céntimos (entero)';
    case 'select':
      if (typeof value !== 'string') return 'Debe ser texto';
      return !def.options || def.options.includes(value)
        ? null
        : `Debe ser una de: ${def.options.join(', ')}`;
    case 'rating':
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5
        ? null
        : 'Debe ser un entero entre 0 y 5';
    case 'date':
      return typeof value === 'string' && isValidDateOnly(value)
        ? null
        : 'Debe ser una fecha YYYY-MM-DD';
    case 'url':
      try {
        const url = new URL(String(value));
        return url.protocol === 'http:' || url.protocol === 'https:' ? null : 'Solo http(s)';
      } catch {
        return 'Debe ser una URL';
      }
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Debe ser verdadero o falso';
  }
}

/**
 * Lenient validation of `extra` against the list fields: defined fields must have the right type
 * (`null` clears them) and undefined keys are accepted as they are.
 */
export function validateExtra(fieldDefs: readonly FieldDef[], extra: Extra): ExtraIssue[] {
  const issues: ExtraIssue[] = [];
  for (const def of fieldDefs) {
    const value = extra[def.key];
    if (value === undefined || value === null) continue;
    const message = checkValue(def, value);
    if (message) issues.push({ path: `extra.${def.key}`, message });
  }
  return issues;
}
