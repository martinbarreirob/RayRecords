import type { Extra, FieldDef } from '@rayrecords/shared';

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Valor de un campo de `extra` como texto para mostrar. */
export function formatField(def: FieldDef, value: Extra[string] | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  switch (def.type) {
    case 'money':
      return typeof value === 'number' ? euros.format(value / 100) : String(value);
    case 'boolean':
      return value ? 'Sí' : 'No';
    case 'rating':
      return typeof value === 'number' ? `${value}/5` : String(value);
    default:
      return String(value);
  }
}

/** Valor de un campo como texto editable (los importes, en euros). */
export function toInputValue(def: FieldDef, value: Extra[string] | undefined): string {
  if (value === undefined || value === null) return '';
  if (def.type === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
  return String(value);
}

/**
 * Texto del formulario → valor de `extra` (`null` si está vacío: borra el campo; `undefined` si no es
 * válido para el tipo). Los importes se escriben en euros y se guardan en céntimos.
 */
export function fromInputValue(def: FieldDef, raw: string): Extra[string] | undefined {
  const text = raw.trim();
  if (text === '') return null;
  switch (def.type) {
    case 'number':
    case 'rating': {
      const n = Number(text.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'money': {
      const n = Number(text.replace(',', '.'));
      // toPrecision evita el error de coma flotante (1,005 · 100 = 100,4999…).
      return Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(15))) : undefined;
    }
    case 'boolean':
      return text === 'true' || text.toLowerCase() === 'sí' || text === '1';
    default:
      return text;
  }
}

/**
 * Enlace escrito → dirección `http(s)` válida: `''` si está vacío, `null` si no vale. Sin protocolo se
 * asume `https://` (así `ejemplo.com` también sirve).
 */
export function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (text === '') return '';
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    return web && url.hostname !== '' ? withProtocol : null;
  } catch {
    return null;
  }
}
