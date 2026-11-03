import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Películas', 'peliculas'],
    ['Películas de 2024!', 'peliculas-de-2024'],
    ['  Lista   libre  ', 'lista-libre'],
    ['Año Nuevo', 'ano-nuevo'],
    ['---', ''],
    ['', ''],
  ])('"%s" → "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('limita la longitud sin dejar un guion final', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
