import type { FieldDef } from '@rayrecords/shared';
import { formatField, fromInputValue, normalizeUrl, toInputValue } from './field-format';

const def = (type: FieldDef['type']): FieldDef => ({ key: 'k', label: 'K', type });

describe('field-format', () => {
  it('shows amounts in euros, yes/no and ratings', () => {
    expect(formatField(def('money'), 8900)).toContain('89,00');
    expect(formatField(def('boolean'), true)).toBe('Sí');
    expect(formatField(def('rating'), 4)).toBe('4/5');
    expect(formatField(def('text'), undefined)).toBe('');
    expect(formatField(def('text'), null)).toBe('');
  });

  it('amounts are edited in euros and stored in cents', () => {
    expect(toInputValue(def('money'), 8905)).toBe('89.05');
    expect(fromInputValue(def('money'), '89,05')).toBe(8905);
    expect(fromInputValue(def('money'), '0.1')).toBe(10);
    expect(fromInputValue(def('money'), 'caro')).toBeUndefined();
  });

  it('empty clears the field (null) and numbers are validated', () => {
    expect(fromInputValue(def('text'), '  ')).toBeNull();
    expect(fromInputValue(def('number'), '2024')).toBe(2024);
    expect(fromInputValue(def('number'), 'dos')).toBeUndefined();
    expect(fromInputValue(def('text'), ' hola ')).toBe('hola');
    expect(fromInputValue(def('boolean'), 'true')).toBe(true);
    expect(fromInputValue(def('boolean'), 'false')).toBe(false);
  });

  it('shows non-amount values as text and keeps already formatted ones', () => {
    expect(formatField(def('select'), 'visto')).toBe('visto');
    expect(formatField(def('number'), 2024)).toBe('2024');
    expect(formatField(def('boolean'), false)).toBe('No');
    expect(formatField(def('money'), 'gratis')).toBe('gratis');
    expect(formatField(def('rating'), 'alta')).toBe('alta');
    expect(formatField(def('text'), '')).toBe('');
  });

  it('numbers accept a decimal comma and ratings are validated the same way', () => {
    expect(fromInputValue(def('number'), '3,5')).toBe(3.5);
    expect(fromInputValue(def('rating'), '4')).toBe(4);
    expect(fromInputValue(def('rating'), 'cuatro')).toBeUndefined();
  });

  it('booleans accept sí, 1 and true; anything else is false', () => {
    expect(fromInputValue(def('boolean'), 'Sí')).toBe(true);
    expect(fromInputValue(def('boolean'), '1')).toBe(true);
    expect(fromInputValue(def('boolean'), 'no')).toBe(false);
  });

  it('when editing, non-amounts are returned as is and empty stays blank', () => {
    expect(toInputValue(def('text'), 'hola')).toBe('hola');
    expect(toInputValue(def('number'), 7)).toBe('7');
    expect(toInputValue(def('money'), undefined)).toBe('');
    expect(toInputValue(def('money'), null)).toBe('');
    expect(toInputValue(def('boolean'), true)).toBe('true');
  });

  it('an amount with extra decimals is rounded to cents', () => {
    expect(fromInputValue(def('money'), '1,005')).toBe(101);
    expect(fromInputValue(def('money'), '12')).toBe(1200);
  });

  it('normalizeUrl: empty, with protocol, without protocol and invalid', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl(' http://example.com ')).toBe('http://example.com');
    expect(normalizeUrl('example.com/ruta')).toBe('https://example.com/ruta');
    expect(normalizeUrl('ftp://example.com')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('dos palabras')).toBeNull();
  });
});
