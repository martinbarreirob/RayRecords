import type { FieldDef } from '@rayrecords/shared';
import { formatField, fromInputValue, normalizeUrl, toInputValue } from './field-format';

const def = (type: FieldDef['type']): FieldDef => ({ key: 'k', label: 'K', type });

describe('field-format', () => {
  it('muestra importes en euros, sí/no y puntuaciones', () => {
    expect(formatField(def('money'), 8900)).toContain('89,00');
    expect(formatField(def('boolean'), true)).toBe('Sí');
    expect(formatField(def('rating'), 4)).toBe('4/5');
    expect(formatField(def('text'), undefined)).toBe('');
    expect(formatField(def('text'), null)).toBe('');
  });

  it('los importes se editan en euros y se guardan en céntimos', () => {
    expect(toInputValue(def('money'), 8905)).toBe('89.05');
    expect(fromInputValue(def('money'), '89,05')).toBe(8905);
    expect(fromInputValue(def('money'), '0.1')).toBe(10);
    expect(fromInputValue(def('money'), 'caro')).toBeUndefined();
  });

  it('vacío borra el campo (null) y los números se validan', () => {
    expect(fromInputValue(def('text'), '  ')).toBeNull();
    expect(fromInputValue(def('number'), '2024')).toBe(2024);
    expect(fromInputValue(def('number'), 'dos')).toBeUndefined();
    expect(fromInputValue(def('text'), ' hola ')).toBe('hola');
    expect(fromInputValue(def('boolean'), 'true')).toBe(true);
    expect(fromInputValue(def('boolean'), 'false')).toBe(false);
  });

  it('muestra los valores que no son importe como texto y respeta los ya formateados', () => {
    expect(formatField(def('select'), 'visto')).toBe('visto');
    expect(formatField(def('number'), 2024)).toBe('2024');
    expect(formatField(def('boolean'), false)).toBe('No');
    expect(formatField(def('money'), 'gratis')).toBe('gratis');
    expect(formatField(def('rating'), 'alta')).toBe('alta');
    expect(formatField(def('text'), '')).toBe('');
  });

  it('los números admiten coma decimal y las puntuaciones se validan igual', () => {
    expect(fromInputValue(def('number'), '3,5')).toBe(3.5);
    expect(fromInputValue(def('rating'), '4')).toBe(4);
    expect(fromInputValue(def('rating'), 'cuatro')).toBeUndefined();
  });

  it('los booleanos aceptan sí, 1 y true; cualquier otra cosa es no', () => {
    expect(fromInputValue(def('boolean'), 'Sí')).toBe(true);
    expect(fromInputValue(def('boolean'), '1')).toBe(true);
    expect(fromInputValue(def('boolean'), 'no')).toBe(false);
  });

  it('al editar, lo que no es importe se devuelve tal cual y lo vacío queda en blanco', () => {
    expect(toInputValue(def('text'), 'hola')).toBe('hola');
    expect(toInputValue(def('number'), 7)).toBe('7');
    expect(toInputValue(def('money'), undefined)).toBe('');
    expect(toInputValue(def('money'), null)).toBe('');
    expect(toInputValue(def('boolean'), true)).toBe('true');
  });

  it('un importe con decimales de más se redondea a céntimos', () => {
    expect(fromInputValue(def('money'), '1,005')).toBe(101);
    expect(fromInputValue(def('money'), '12')).toBe(1200);
  });

  it('normalizeUrl: vacío, con protocolo, sin protocolo y no válido', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
    expect(normalizeUrl('https://ejemplo.com/a?b=1')).toBe('https://ejemplo.com/a?b=1');
    expect(normalizeUrl(' http://ejemplo.com ')).toBe('http://ejemplo.com');
    expect(normalizeUrl('ejemplo.com/ruta')).toBe('https://ejemplo.com/ruta');
    expect(normalizeUrl('ftp://ejemplo.com')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('dos palabras')).toBeNull();
  });
});
