import { describe, expect, it } from 'vitest';
import { parseQuickCapture } from './parse';
import type { CaptureResult } from './types';

// 2026-11-03 10:00 UTC = 11:00 en Madrid (horario de invierno).
const NOW = new Date('2026-11-03T10:00:00Z');
const parse = (input: string, aliases?: readonly string[]): CaptureResult =>
  parseQuickCapture(input, { now: NOW, ...(aliases && { aliases }) });

describe('peli:', () => {
  it('crea un elemento en la lista de películas con tags', () => {
    expect(parse('peli: Dune #scifi')).toEqual({
      kind: 'item',
      list: 'peli',
      title: 'Dune',
      tags: ['scifi'],
    });
  });

  it('admite varios tags, en minúsculas y sin duplicados', () => {
    expect(parse('peli: Dune #SciFi #Denis #scifi')).toMatchObject({ tags: ['scifi', 'denis'] });
    expect(parse('peli: Sing #Sci-Fi #sci-fi')).toMatchObject({ tags: ['sci-fi'] });
  });

  it('quita los tags aunque estén en medio del texto', () => {
    expect(parse('peli: The #matrix Reloaded')).toMatchObject({
      title: 'The Reloaded',
      tags: ['matrix'],
    });
  });

  it('ignora la puntuación pegada al tag', () => {
    expect(parse('peli: Dune #scifi, genial')).toMatchObject({
      title: 'Dune genial',
      tags: ['scifi'],
    });
  });

  it('conserva los dos puntos del título', () => {
    expect(parse('peli: Matrix: Reloaded')).toMatchObject({ title: 'Matrix: Reloaded' });
  });

  it('conserva acentos y emojis', () => {
    expect(parse('peli: Amélie 🎬 #francia')).toMatchObject({
      title: 'Amélie 🎬',
      tags: ['francia'],
    });
  });

  it('no trata como tag lo que no lo es: "#1", "C#" o un fragmento de URL', () => {
    expect(parse('peli: #1 fan')).toMatchObject({ title: '#1 fan', tags: [] });
    expect(parse('peli: C# programming')).toMatchObject({ title: 'C# programming', tags: [] });
    expect(parse('peli: Dune #')).toMatchObject({ title: 'Dune #', tags: [] });
    expect(parse('peli: Blade Runner https://imdb.com/title/x#cast')).toMatchObject({
      title: 'Blade Runner',
      url: 'https://imdb.com/title/x#cast',
      tags: [],
    });
  });

  it('tolera mayúsculas, espacios alrededor de los dos puntos y su ausencia', () => {
    for (const input of ['PELI: Dune', 'Peli : Dune', 'peli:Dune', '  peli:   Dune  ']) {
      expect(parse(input)).toMatchObject({ kind: 'item', list: 'peli', title: 'Dune' });
    }
  });

  it('une un texto multilínea en un único título', () => {
    expect(parse('peli: Dune\nParte 2')).toMatchObject({ title: 'Dune Parte 2' });
  });
});

describe('compra:', () => {
  it('extrae categoría, precio y enlace', () => {
    expect(parse('compra: Cafetera Nespresso @hogar 89€ https://tienda.com/p/1')).toEqual({
      kind: 'item',
      list: 'compra',
      title: 'Cafetera Nespresso',
      tags: [],
      category: 'hogar',
      priceCents: 8900,
      url: 'https://tienda.com/p/1',
    });
  });

  it('acepta categoría con acentos y el orden libre de los elementos', () => {
    expect(parse('compra: https://tienda.com/a 1.299,99€ Auriculares @tecnología')).toMatchObject({
      title: 'Auriculares',
      category: 'tecnología',
      priceCents: 129_999,
      url: 'https://tienda.com/a',
    });
  });

  it('completa el enlace que empieza por www', () => {
    expect(parse('compra: Lámpara www.tienda.es/lampara')).toMatchObject({
      title: 'Lámpara',
      url: 'https://www.tienda.es/lampara',
    });
  });

  it('quita la puntuación final del enlace', () => {
    expect(parse('compra: Lámpara https://tienda.es/l.')).toMatchObject({
      url: 'https://tienda.es/l',
    });
  });

  it('solo usa la primera categoría, el primer importe y el primer enlace', () => {
    expect(parse('compra: Lote @a @b 10€ 20€ https://a.com https://b.com')).toMatchObject({
      title: 'Lote @b 20€ https://b.com',
      category: 'a',
      priceCents: 1000,
      url: 'https://a.com',
    });
  });

  it('no confunde un email con una categoría', () => {
    expect(parse('compra: Escribir a ana@mail.com')).toMatchObject({
      title: 'Escribir a ana@mail.com',
    });
    expect(parse('compra: Escribir a ana@mail.com')).not.toHaveProperty('category');
  });

  it('no inventa un precio donde solo hay un número', () => {
    const result = parse('compra: Dune 2');
    expect(result).toMatchObject({ title: 'Dune 2' });
    expect(result).not.toHaveProperty('priceCents');
  });

  it('deja el enlace inválido en el título en vez de fallar', () => {
    expect(parse('compra: Cosa http://[::1')).toMatchObject({ title: 'Cosa http://[::1' });
  });
});

describe('hoy: / mañana:', () => {
  it('crea una tarea con fecha de hoy o de mañana', () => {
    expect(parse('hoy: llamar al dentista')).toEqual({
      kind: 'item',
      list: 'tarea',
      title: 'llamar al dentista',
      tags: [],
      dueDate: '2026-11-03',
    });
    expect(parse('mañana: llamar al dentista')).toMatchObject({
      list: 'tarea',
      dueDate: '2026-11-04',
    });
  });

  it('reconoce mañana con o sin acento y en cualquier capitalización', () => {
    for (const input of ['Mañana: x', 'MAÑANA: x', 'manana: x', 'mañana : x', 'mañana: x']) {
      expect(parse(input)).toMatchObject({ list: 'tarea', dueDate: '2026-11-04' });
    }
  });

  it('admite tags y enlace pero deja @categoría e importes como texto', () => {
    expect(parse('hoy: reunión #trabajo https://meet.example.com/x')).toMatchObject({
      title: 'reunión',
      tags: ['trabajo'],
      url: 'https://meet.example.com/x',
    });
    const task = parse('hoy: comprar pan 2€ y avisar a @ana');
    expect(task).toMatchObject({ title: 'comprar pan 2€ y avisar a @ana' });
    expect(task).not.toHaveProperty('priceCents');
    expect(task).not.toHaveProperty('category');
  });

  it('calcula la fecha en la zona horaria de Madrid, no en UTC', () => {
    const lateNight = new Date('2026-11-03T23:30:00Z'); // ya es 4 de noviembre en Madrid
    expect(parseQuickCapture('hoy: x', { now: lateNight })).toMatchObject({
      dueDate: '2026-11-04',
    });
    expect(parseQuickCapture('hoy: x', { now: lateNight, timeZone: 'UTC' })).toMatchObject({
      dueDate: '2026-11-03',
    });
  });

  it('cruza el cambio de hora, fin de mes, fin de año y año bisiesto', () => {
    const dst = new Date('2026-03-28T23:30:00Z'); // 00:30 del 29 de marzo en Madrid, día del cambio
    expect(parseQuickCapture('hoy: x', { now: dst })).toMatchObject({ dueDate: '2026-03-29' });
    expect(parseQuickCapture('mañana: x', { now: dst })).toMatchObject({ dueDate: '2026-03-30' });
    expect(parseQuickCapture('mañana: x', { now: new Date('2026-12-31T10:00:00Z') })).toMatchObject(
      { dueDate: '2027-01-01' },
    );
    expect(parseQuickCapture('mañana: x', { now: new Date('2028-02-28T10:00:00Z') })).toMatchObject(
      { dueDate: '2028-02-29' },
    );
  });

  it('une un texto multilínea', () => {
    expect(parse('hoy: llamar\nal dentista')).toMatchObject({ title: 'llamar al dentista' });
  });
});

describe('sin prefijo → nota del día', () => {
  it('guarda el texto tal cual con la fecha de hoy', () => {
    expect(parse('Me ha gustado mucho el libro')).toEqual({
      kind: 'daily_note',
      date: '2026-11-03',
      text: 'Me ha gustado mucho el libro',
      reason: 'no_prefix',
    });
  });

  it('recorta los espacios de los extremos pero respeta los saltos de línea internos', () => {
    expect(parse('  línea 1\nlínea 2  ')).toMatchObject({ text: 'línea 1\nlínea 2' });
  });

  it('no toma por prefijo una URL, una hora ni unos dos puntos iniciales', () => {
    for (const input of [
      'https://example.com/x',
      'http://example.com',
      '10:30 llamar a Juan',
      ': texto',
    ]) {
      expect(parse(input)).toMatchObject({ kind: 'daily_note', reason: 'no_prefix', text: input });
    }
  });

  it('no toma por prefijo una frase larga antes de los dos puntos', () => {
    const input = 'esto es una frase larguísima antes de los dos puntos: texto';
    expect(parse(input)).toMatchObject({ kind: 'daily_note', reason: 'no_prefix' });
  });

  it('no reconoce "hoy" cuando solo es una palabra dentro del prefijo', () => {
    expect(parse('Nota de hoy: algo')).toMatchObject({
      kind: 'daily_note',
      reason: 'unknown_prefix',
      text: 'Nota de hoy: algo',
    });
  });
});

describe('prefijo desconocido → nota del día sin fallar', () => {
  it('guarda el texto completo, prefijo incluido', () => {
    expect(parse('idea: app de recetas #side')).toEqual({
      kind: 'daily_note',
      date: '2026-11-03',
      text: 'idea: app de recetas #side',
      reason: 'unknown_prefix',
    });
  });

  it('también cuando no hay nada tras los dos puntos', () => {
    expect(parse('foo:')).toMatchObject({
      kind: 'daily_note',
      text: 'foo:',
      reason: 'unknown_prefix',
    });
  });
});

describe('entradas vacías', () => {
  it.each(['', '   ', '\n\t '])('la entrada en blanco %j no guarda nada', (input) => {
    expect(parse(input)).toEqual({ kind: 'empty', reason: 'blank' });
  });

  it.each([
    'peli:',
    'peli:   ',
    'peli: #scifi',
    'compra: 89€',
    'compra: @hogar 89€',
    'hoy:',
    'mañana: #x',
  ])('el prefijo sin título (%j) no guarda nada', (input) => {
    expect(parse(input)).toEqual({ kind: 'empty', reason: 'no_title' });
  });
});

describe('alias configurables', () => {
  it('reconoce los alias de las listas y deja de reconocer los de por defecto', () => {
    expect(parse('serie: Severance #thriller', ['serie', 'juego'])).toEqual({
      kind: 'item',
      list: 'serie',
      title: 'Severance',
      tags: ['thriller'],
    });
    expect(parse('peli: Dune', ['serie'])).toMatchObject({
      kind: 'daily_note',
      reason: 'unknown_prefix',
    });
  });

  it('mantiene hoy/mañana aunque se cambien los alias', () => {
    expect(parse('hoy: x', ['serie'])).toMatchObject({ kind: 'item', list: 'tarea' });
  });
});

describe('robustez', () => {
  it('nunca lanza con entradas raras', () => {
    const weird = [
      '\0',
      ':',
      '::',
      '@',
      '#',
      '€',
      'peli:€',
      'peli: https://',
      'peli: www.',
      'peli: http://[::1',
      'compra: 99999999999999999999€',
      '‮ peli: x',
      'a'.repeat(10_000),
      `peli:${' '.repeat(1000)}x`,
      `compra: ${'1.'.repeat(500)}€`,
    ];
    for (const input of weird) {
      expect(['item', 'daily_note', 'empty']).toContain(parse(input).kind);
    }
  });
});
