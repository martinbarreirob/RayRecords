import type { FieldDef } from '@rayrecords/shared';
import { describe, expect, it } from 'vitest';
import { validateExtra } from './extra';

const defs: FieldDef[] = [
  { key: 'anio', label: 'Año', type: 'number' },
  { key: 'estado', label: 'Estado', type: 'select', options: ['pendiente', 'visto'] },
  { key: 'precio', label: 'Precio', type: 'money' },
  { key: 'nota', label: 'Nota', type: 'rating' },
  { key: 'dia', label: 'Día', type: 'date' },
  { key: 'web', label: 'Web', type: 'url' },
  { key: 'ok', label: 'Ok', type: 'boolean' },
  { key: 'donde', label: 'Dónde', type: 'text' },
];

describe('validateExtra', () => {
  it('accepts valid values, null and free keys', () => {
    expect(
      validateExtra(defs, {
        anio: 2024,
        estado: 'visto',
        precio: 8900,
        nota: 4,
        dia: '2026-02-28',
        web: 'https://a.es',
        ok: true,
        donde: 'casa',
        cualquierCosa: 'libre',
        precio2: null,
      }),
    ).toEqual([]);
    expect(validateExtra(defs, { anio: null })).toEqual([]);
  });

  it('rejects wrong types with the field path', () => {
    const paths = validateExtra(defs, {
      anio: 'dos mil',
      estado: 'raro',
      precio: 89.5,
      nota: 9,
      dia: '2026-02-30',
      web: 'ftp://x',
      ok: 'sí',
      donde: 3,
    }).map((i) => i.path);
    expect(paths).toEqual([
      'extra.anio',
      'extra.estado',
      'extra.precio',
      'extra.nota',
      'extra.dia',
      'extra.web',
      'extra.ok',
      'extra.donde',
    ]);
  });
});
