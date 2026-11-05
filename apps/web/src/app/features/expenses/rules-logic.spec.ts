import { categoryKeyError, keyFromName, patternError } from './rules-logic';

describe('keyFromName', () => {
  it('quita acentos y espacios', () => {
    expect(keyFromName('Ocio y cultura')).toBe('ocio_y_cultura');
    expect(keyFromName('  Educación  ')).toBe('educacion');
  });

  it('empieza siempre por una letra', () => {
    expect(keyFromName('3D y más')).toBe('c_3d_y_mas');
  });

  it('devuelve vacío si no queda nada utilizable y recorta a 40', () => {
    expect(keyFromName('¡¿?!')).toBe('');
    expect(keyFromName('a'.repeat(60))).toHaveLength(40);
  });
});

describe('categoryKeyError', () => {
  it('acepta claves válidas y la clave aún vacía', () => {
    expect(categoryKeyError('mascotas', [])).toBeNull();
    expect(categoryKeyError('', [])).toBeNull();
  });

  it('rechaza mayúsculas iniciales, espacios y acentos', () => {
    expect(categoryKeyError('Mascotas', [])).not.toBeNull();
    expect(categoryKeyError('mis gastos', [])).not.toBeNull();
    expect(categoryKeyError('educación', [])).not.toBeNull();
  });

  it('avisa de las duplicadas', () => {
    expect(categoryKeyError('ocio', ['ocio'])).toMatch(/Ya existe/);
  });
});

describe('patternError', () => {
  it('solo valida las expresiones regulares', () => {
    expect(patternError('contains', '(')).toBeNull();
    expect(patternError('regex', 'mercadona|dia')).toBeNull();
    expect(patternError('regex', '(')).not.toBeNull();
  });
});
