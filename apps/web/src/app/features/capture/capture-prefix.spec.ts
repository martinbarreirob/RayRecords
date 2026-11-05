import type { List } from '@rayrecords/shared';
import {
  closestPrefix,
  completion,
  listLikePrefix,
  prefixOptions,
  suggestPrefixes,
} from './capture-prefix';

const list = (name: string, captureAlias?: string, archived = false): List =>
  ({ name, captureAlias, archived }) as List;
const lists = [
  list('Películas', 'peli'),
  list('Compras', 'compra'),
  list('Ideas'),
  list('Viejo', 'viejo', true),
];
const options = prefixOptions(lists);

describe('prefixOptions', () => {
  it('toma el alias de cada lista con alias y no archivada, más hoy y mañana', () => {
    expect(options.map((option) => option.prefix)).toEqual(['peli', 'compra', 'hoy', 'mañana']);
    expect(options[1]).toEqual({ prefix: 'compra', label: 'Compras' });
  });

  it('mientras no hay listas usa los alias de los presets', () => {
    expect(prefixOptions(null).map((option) => option.prefix)).toEqual([
      'peli',
      'compra',
      'hoy',
      'mañana',
    ]);
  });
});

describe('suggestPrefixes', () => {
  it('«com» sugiere compra: y Tab lo completa con los dos puntos', () => {
    const [first] = suggestPrefixes('com', options);
    expect(first?.prefix).toBe('compra');
    expect(completion(first!)).toBe('compra: ');
  });

  it('ignora mayúsculas y tildes: «man» → mañana', () => {
    expect(suggestPrefixes('MAN', options).map((option) => option.prefix)).toEqual(['mañana']);
  });

  it('encaja también por el nombre de la lista: «pel» → peli (Películas)', () => {
    expect(suggestPrefixes('pel', options).map((option) => option.prefix)).toEqual(['peli']);
  });

  it('el prefijo gana al nombre cuando los dos encajan', () => {
    const extra = [{ prefix: 'cine', label: 'Pelis' }, ...options];
    expect(suggestPrefixes('pel', extra).map((option) => option.prefix)).toEqual(['peli', 'cine']);
  });

  it('con una sola letra, o con espacios o dos puntos, no sugiere', () => {
    expect(suggestPrefixes('c', options)).toEqual([]);
    expect(suggestPrefixes('compra leche', options)).toEqual([]);
    expect(suggestPrefixes('compra:', options)).toEqual([]);
    expect(suggestPrefixes('', options)).toEqual([]);
    expect(suggestPrefixes('123', options)).toEqual([]);
  });

  it('una palabra que no encaja con nada no sugiere', () => {
    expect(suggestPrefixes('zzz', options)).toEqual([]);
  });
});

describe('listLikePrefix', () => {
  it('devuelve la palabra corta antes de los dos puntos', () => {
    expect(listLikePrefix('compras: leche')).toBe('compras');
    expect(listLikePrefix('  Idea : algo')).toBe('Idea');
  });

  it('no toma por prefijo frases, números ni enlaces', () => {
    expect(listLikePrefix('reunión con Ana: informe')).toBeNull();
    expect(listLikePrefix('10:30 llamar')).toBeNull();
    expect(listLikePrefix('https://tienda.com/p')).toBeNull();
    expect(listLikePrefix('sin dos puntos')).toBeNull();
    expect(listLikePrefix(':hola')).toBeNull();
  });
});

describe('closestPrefix', () => {
  it('encuentra el prefijo parecido (plural, letras de menos o de más)', () => {
    expect(closestPrefix('compras', options)?.prefix).toBe('compra');
    expect(closestPrefix('comp', options)?.prefix).toBe('compra');
    expect(closestPrefix('pelis', options)?.prefix).toBe('peli');
    expect(closestPrefix('manana', options)?.prefix).toBe('mañana');
    expect(closestPrefix('copra', options)?.prefix).toBe('compra');
  });

  it('lo que no se parece a nada devuelve null', () => {
    expect(closestPrefix('idea', options)).toBeNull();
    expect(closestPrefix('ab', options)).toBeNull();
  });
});
