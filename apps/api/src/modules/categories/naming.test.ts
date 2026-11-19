import { describe, expect, it } from 'vitest';
import { categoryNameKey, freeKey, keyFromName } from './naming';

describe('categoryNameKey', () => {
  it('ignores accents, capitals and outer spaces', () => {
    expect(categoryNameKey('  Bébidas ')).toBe('bebidas');
  });
});

describe('keyFromName', () => {
  it('lowercases, drops accents and joins words with underscores', () => {
    expect(keyFromName('Ocio y cultura')).toBe('ocio_y_cultura');
    expect(keyFromName('  Restauración! ')).toBe('restauracion');
  });

  it('starts with a letter and has a fallback for names without letters or digits', () => {
    expect(keyFromName('3D')).toBe('c_3d');
    expect(keyFromName('€€€')).toBe('categoria');
  });

  it('is at most 40 characters', () => {
    expect(keyFromName('a'.repeat(80))).toHaveLength(40);
  });
});

describe('freeKey', () => {
  it('uses the plain key when it is free and numbers it when it is not', () => {
    expect(freeKey('Mascotas', new Set())).toBe('mascotas');
    expect(freeKey('Mascotas', new Set(['mascotas']))).toBe('mascotas_2');
    expect(freeKey('Mascotas', new Set(['mascotas', 'mascotas_2']))).toBe('mascotas_3');
  });

  it('keeps the suffix inside the 40 characters', () => {
    const long = 'a'.repeat(40);
    expect(freeKey(long, new Set([long]))).toHaveLength(40);
    expect(freeKey(long, new Set([long]))).toMatch(/_2$/);
  });
});
