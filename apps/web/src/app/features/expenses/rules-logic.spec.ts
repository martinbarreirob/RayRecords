import { keyFromName, patternError } from './rules-logic';

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

describe('patternError', () => {
  it('validates only regular expressions', () => {
    expect(patternError('contains', '(')).toBeNull();
    expect(patternError('regex', 'mercadona|dia')).toBeNull();
    expect(patternError('regex', '(')).not.toBeNull();
  });
});
