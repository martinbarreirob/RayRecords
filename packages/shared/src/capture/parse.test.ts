import { describe, expect, it } from 'vitest';
import { parseQuickCapture } from './parse';
import type { CaptureResult } from './types';

// 2026-11-03 10:00 UTC = 11:00 in Madrid (winter time).
const NOW = new Date('2026-11-03T10:00:00Z');
const parse = (input: string, aliases?: readonly string[]): CaptureResult =>
  parseQuickCapture(input, { now: NOW, ...(aliases && { aliases }) });

describe('peli:', () => {
  it('creates an item in the movies list with tags', () => {
    expect(parse('peli: Dune #scifi')).toEqual({
      kind: 'item',
      list: 'peli',
      title: 'Dune',
      tags: ['scifi'],
    });
  });

  it('accepts several tags, lowercased and without duplicates', () => {
    expect(parse('peli: Dune #SciFi #Denis #scifi')).toMatchObject({ tags: ['scifi', 'denis'] });
    expect(parse('peli: Sing #Sci-Fi #sci-fi')).toMatchObject({ tags: ['sci-fi'] });
  });

  it('removes tags even in the middle of the text', () => {
    expect(parse('peli: The #matrix Reloaded')).toMatchObject({
      title: 'The Reloaded',
      tags: ['matrix'],
    });
  });

  it('ignores punctuation attached to a tag', () => {
    expect(parse('peli: Dune #scifi, genial')).toMatchObject({
      title: 'Dune genial',
      tags: ['scifi'],
    });
  });

  it('keeps the colons of the title', () => {
    expect(parse('peli: Matrix: Reloaded')).toMatchObject({ title: 'Matrix: Reloaded' });
  });

  it('keeps accents and emojis', () => {
    expect(parse('peli: Amélie 🎬 #francia')).toMatchObject({
      title: 'Amélie 🎬',
      tags: ['francia'],
    });
  });

  it('does not treat non-tags as tags: "#1", "C#" or a URL fragment', () => {
    expect(parse('peli: #1 fan')).toMatchObject({ title: '#1 fan', tags: [] });
    expect(parse('peli: C# programming')).toMatchObject({ title: 'C# programming', tags: [] });
    expect(parse('peli: Dune #')).toMatchObject({ title: 'Dune #', tags: [] });
    expect(parse('peli: Blade Runner https://imdb.com/title/x#cast')).toMatchObject({
      title: 'Blade Runner',
      url: 'https://imdb.com/title/x#cast',
      tags: [],
    });
  });

  it('tolerates uppercase, spaces around the colon and no space at all', () => {
    for (const input of ['PELI: Dune', 'Peli : Dune', 'peli:Dune', '  peli:   Dune  ']) {
      expect(parse(input)).toMatchObject({ kind: 'item', list: 'peli', title: 'Dune' });
    }
  });

  it('joins multiline text into a single title', () => {
    expect(parse('peli: Dune\nParte 2')).toMatchObject({ title: 'Dune Parte 2' });
  });
});

describe('compra:', () => {
  it('extracts category, price and link', () => {
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

  it('accepts a category with accents and any order of the parts', () => {
    expect(parse('compra: https://tienda.com/a 1.299,99€ Auriculares @tecnología')).toMatchObject({
      title: 'Auriculares',
      category: 'tecnología',
      priceCents: 129_999,
      url: 'https://tienda.com/a',
    });
  });

  it('completes a link that starts with www', () => {
    expect(parse('compra: Lámpara www.tienda.es/lampara')).toMatchObject({
      title: 'Lámpara',
      url: 'https://www.tienda.es/lampara',
    });
  });

  it('strips trailing punctuation from the link', () => {
    expect(parse('compra: Lámpara https://tienda.es/l.')).toMatchObject({
      url: 'https://tienda.es/l',
    });
  });

  it('only uses the first category, the first amount and the first link', () => {
    expect(parse('compra: Lote @a @b 10€ 20€ https://a.com https://b.com')).toMatchObject({
      title: 'Lote @b 20€ https://b.com',
      category: 'a',
      priceCents: 1000,
      url: 'https://a.com',
    });
  });

  it('does not mistake an email for a category', () => {
    expect(parse('compra: Escribir a ana@mail.com')).toMatchObject({
      title: 'Escribir a ana@mail.com',
    });
    expect(parse('compra: Escribir a ana@mail.com')).not.toHaveProperty('category');
  });

  it('does not invent a price where there is only a number', () => {
    const result = parse('compra: Dune 2');
    expect(result).toMatchObject({ title: 'Dune 2' });
    expect(result).not.toHaveProperty('priceCents');
  });

  it('leaves an invalid link in the title instead of failing', () => {
    expect(parse('compra: Cosa http://[::1')).toMatchObject({ title: 'Cosa http://[::1' });
  });
});

describe('hoy: / mañana:', () => {
  it('creates a task dated today or tomorrow', () => {
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

  it('recognizes mañana with or without accent and in any capitalization', () => {
    for (const input of ['Mañana: x', 'MAÑANA: x', 'manana: x', 'mañana : x', 'mañana: x']) {
      expect(parse(input)).toMatchObject({ list: 'tarea', dueDate: '2026-11-04' });
    }
  });

  it('accepts tags and link but leaves @category and amounts as text', () => {
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

  it('computes the date in the Madrid time zone, not UTC', () => {
    const lateNight = new Date('2026-11-03T23:30:00Z'); // ya es 4 de noviembre en Madrid
    expect(parseQuickCapture('hoy: x', { now: lateNight })).toMatchObject({
      dueDate: '2026-11-04',
    });
    expect(parseQuickCapture('hoy: x', { now: lateNight, timeZone: 'UTC' })).toMatchObject({
      dueDate: '2026-11-03',
    });
  });

  it('crosses the clock change, month end, year end and leap year', () => {
    const dst = new Date('2026-03-28T23:30:00Z'); // 00:30 on 29 March in Madrid, the day of the clock change
    expect(parseQuickCapture('hoy: x', { now: dst })).toMatchObject({ dueDate: '2026-03-29' });
    expect(parseQuickCapture('mañana: x', { now: dst })).toMatchObject({ dueDate: '2026-03-30' });
    expect(parseQuickCapture('mañana: x', { now: new Date('2026-12-31T10:00:00Z') })).toMatchObject(
      { dueDate: '2027-01-01' },
    );
    expect(parseQuickCapture('mañana: x', { now: new Date('2028-02-28T10:00:00Z') })).toMatchObject(
      { dueDate: '2028-02-29' },
    );
  });

  it('joins multiline text', () => {
    expect(parse('hoy: llamar\nal dentista')).toMatchObject({ title: 'llamar al dentista' });
  });
});

describe('no prefix -> daily note', () => {
  it('stores the text as is with the date of today', () => {
    expect(parse('Me ha gustado mucho el libro')).toEqual({
      kind: 'daily_note',
      date: '2026-11-03',
      text: 'Me ha gustado mucho el libro',
      reason: 'no_prefix',
    });
  });

  it('trims the ends but keeps inner line breaks', () => {
    expect(parse('  línea 1\nlínea 2  ')).toMatchObject({ text: 'línea 1\nlínea 2' });
  });

  it('does not take a URL, a time or a leading colon as a prefix', () => {
    for (const input of [
      'https://example.com/x',
      'http://example.com',
      '10:30 llamar a Juan',
      ': texto',
    ]) {
      expect(parse(input)).toMatchObject({ kind: 'daily_note', reason: 'no_prefix', text: input });
    }
  });

  it('does not take a long phrase before the colon as a prefix', () => {
    const input = 'esto es una frase larguísima antes de los dos puntos: texto';
    expect(parse(input)).toMatchObject({ kind: 'daily_note', reason: 'no_prefix' });
  });

  it('does not recognize "hoy" when it is only a word inside the prefix', () => {
    expect(parse('Nota de hoy: algo')).toMatchObject({
      kind: 'daily_note',
      reason: 'unknown_prefix',
      text: 'Nota de hoy: algo',
    });
  });
});

describe('unknown prefix -> daily note without failing', () => {
  it('stores the whole text, prefix included', () => {
    expect(parse('idea: app de recetas #side')).toEqual({
      kind: 'daily_note',
      date: '2026-11-03',
      text: 'idea: app de recetas #side',
      reason: 'unknown_prefix',
    });
  });

  it('also when there is nothing after the colon', () => {
    expect(parse('foo:')).toMatchObject({
      kind: 'daily_note',
      text: 'foo:',
      reason: 'unknown_prefix',
    });
  });
});

describe('empty input', () => {
  it.each(['', '   ', '\n\t '])('blank input %j saves nothing', (input) => {
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
  ])('a prefix without a title (%j) saves nothing', (input) => {
    expect(parse(input)).toEqual({ kind: 'empty', reason: 'no_title' });
  });
});

describe('configurable aliases', () => {
  it('recognizes the list aliases and stops recognizing the defaults', () => {
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

  it('keeps hoy/mañana even when the aliases change', () => {
    expect(parse('hoy: x', ['serie'])).toMatchObject({ kind: 'item', list: 'tarea' });
  });
});

describe('robustness', () => {
  it('never throws on odd input', () => {
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

describe('performance', () => {
  it('stays fast on long adversarial input', () => {
    const inputs = [
      `compra: ${'1'.repeat(4_000)}`,
      `compra: ${'1.111'.repeat(800)}`,
      `compra: ${'#a-'.repeat(1_500)}`,
      `compra: ${'1 '.repeat(2_000)}€`,
    ];
    const start = performance.now();
    for (const input of inputs) parse(input);
    expect(performance.now() - start).toBeLessThan(1_000);
  });
});
