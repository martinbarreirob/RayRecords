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
  it('takes the alias of each non-archived list with an alias, plus hoy and mañana', () => {
    expect(options.map((option) => option.prefix)).toEqual(['peli', 'compra', 'hoy', 'mañana']);
    expect(options[1]).toEqual({ prefix: 'compra', label: 'Compras' });
  });

  it('while there are no lists it uses the preset aliases', () => {
    expect(prefixOptions(null).map((option) => option.prefix)).toEqual([
      'peli',
      'compra',
      'hoy',
      'mañana',
    ]);
  });
});

describe('suggestPrefixes', () => {
  it('"com" suggests compra: and Tab completes it with the colon', () => {
    const [first] = suggestPrefixes('com', options);
    expect(first?.prefix).toBe('compra');
    expect(completion(first!)).toBe('compra: ');
  });

  it('ignores case and accents: "man" gives mañana', () => {
    expect(suggestPrefixes('MAN', options).map((option) => option.prefix)).toEqual(['mañana']);
  });

  it('also matches by list name: "pel" gives peli (Películas)', () => {
    expect(suggestPrefixes('pel', options).map((option) => option.prefix)).toEqual(['peli']);
  });

  it('the prefix wins over the name when both match', () => {
    const extra = [{ prefix: 'cine', label: 'Pelis' }, ...options];
    expect(suggestPrefixes('pel', extra).map((option) => option.prefix)).toEqual(['peli', 'cine']);
  });

  it('with a single letter, or with spaces or a colon, it does not suggest', () => {
    expect(suggestPrefixes('c', options)).toEqual([]);
    expect(suggestPrefixes('compra leche', options)).toEqual([]);
    expect(suggestPrefixes('compra:', options)).toEqual([]);
    expect(suggestPrefixes('', options)).toEqual([]);
    expect(suggestPrefixes('123', options)).toEqual([]);
  });

  it('a word that matches nothing does not suggest', () => {
    expect(suggestPrefixes('zzz', options)).toEqual([]);
  });
});

describe('listLikePrefix', () => {
  it('returns the short word before the colon', () => {
    expect(listLikePrefix('compras: leche')).toBe('compras');
    expect(listLikePrefix('  Idea : algo')).toBe('Idea');
  });

  it('does not take phrases, numbers or links as a prefix', () => {
    expect(listLikePrefix('reunión con Ana: informe')).toBeNull();
    expect(listLikePrefix('10:30 llamar')).toBeNull();
    expect(listLikePrefix('https://tienda.com/p')).toBeNull();
    expect(listLikePrefix('sin dos puntos')).toBeNull();
    expect(listLikePrefix(':hola')).toBeNull();
  });
});

describe('closestPrefix', () => {
  it('finds the similar prefix (plural, missing or extra letters)', () => {
    expect(closestPrefix('compras', options)?.prefix).toBe('compra');
    expect(closestPrefix('comp', options)?.prefix).toBe('compra');
    expect(closestPrefix('pelis', options)?.prefix).toBe('peli');
    expect(closestPrefix('manana', options)?.prefix).toBe('mañana');
    expect(closestPrefix('copra', options)?.prefix).toBe('compra');
  });

  it('what resembles nothing returns null', () => {
    expect(closestPrefix('idea', options)).toBeNull();
    expect(closestPrefix('ab', options)).toBeNull();
  });
});
