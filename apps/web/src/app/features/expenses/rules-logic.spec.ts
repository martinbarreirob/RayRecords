import { categoryKeyError, keyFromName, patternError } from './rules-logic';

describe('keyFromName', () => {
  it('strips accents and spaces', () => {
    expect(keyFromName('Ocio y cultura')).toBe('ocio_y_cultura');
    expect(keyFromName('  Educación  ')).toBe('educacion');
  });

  it('always starts with a letter', () => {
    expect(keyFromName('3D y más')).toBe('c_3d_y_mas');
  });

  it('returns empty when nothing usable is left and truncates to 40', () => {
    expect(keyFromName('¡¿?!')).toBe('');
    expect(keyFromName('a'.repeat(60))).toHaveLength(40);
  });
});

describe('categoryKeyError', () => {
  it('accepts valid keys and a still-empty key', () => {
    expect(categoryKeyError('mascotas', [])).toBeNull();
    expect(categoryKeyError('', [])).toBeNull();
  });

  it('rejects leading capitals, spaces and accents', () => {
    expect(categoryKeyError('Mascotas', [])).not.toBeNull();
    expect(categoryKeyError('mis gastos', [])).not.toBeNull();
    expect(categoryKeyError('educación', [])).not.toBeNull();
  });

  it('flags duplicates', () => {
    expect(categoryKeyError('ocio', ['ocio'])).toMatch(/Ya existe/);
  });
});

describe('patternError', () => {
  it('validates only regular expressions', () => {
    expect(patternError('contains', '(')).toBeNull();
    expect(patternError('regex', 'mercadona|dia')).toBeNull();
    expect(patternError('regex', '(')).not.toBeNull();
  });
});
