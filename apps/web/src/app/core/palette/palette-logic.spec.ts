import type { Item, List, NoteCard, Transaction } from '@rayrecords/shared';
import {
  captureResult,
  cycleFilter,
  expenseResults,
  flattenGroups,
  formatShortDate,
  groupResults,
  highlightSegments,
  itemResults,
  matchesFilter,
  moveSelection,
  noteLine,
  normalize,
  scoreMatch,
  searchCommands,
  searchLists,
  searchNotes,
  sortByScore,
  type PaletteResult,
} from './palette-logic';

const ID = 'a'.repeat(24);
const NOW = '2026-11-04T10:00:00.000Z';

function list(overrides: Partial<List> = {}): List {
  return {
    id: ID,
    name: 'Reforma del baño',
    slug: 'reforma-del-bano',
    kind: 'free',
    fieldDefs: [],
    order: 0,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as List;
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'b'.repeat(24),
    listId: ID,
    title: 'Pedir presupuesto del alicatado',
    tags: [],
    extra: {},
    order: 0,
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function card(text: string, overrides: Partial<NoteCard> = {}): NoteCard {
  return {
    id: 'c'.repeat(24),
    text,
    x: 0,
    y: 0,
    w: 240,
    z: 0,
    groupId: null,
    doneAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'd'.repeat(24),
    accountId: ID,
    date: '2026-11-02',
    month: '2026-11',
    amountCents: -2490,
    description: 'Cortina de ducha',
    category: null,
    categorySource: 'none',
    ...overrides,
  };
}

const context = { themeLabel: 'Claro', username: 'martin' };

function fake(kind: PaletteResult['kind'], label: string, score = 1): PaletteResult {
  return { id: `${kind}:${label}`, kind, label, score, action: { type: 'go', url: '/x' } };
}

describe('scoreMatch', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(scoreMatch('BANO', 'Reforma del baño')).toBeGreaterThan(0);
    expect(normalize('Baño Ñu')).toBe('bano nu');
  });

  it('no coincide si falta alguna palabra', () => {
    expect(scoreMatch('baño cocina', 'Reforma del baño')).toBe(0);
    expect(scoreMatch('zzz', 'Reforma del baño')).toBe(0);
  });

  it('acepta las palabras en cualquier orden', () => {
    expect(scoreMatch('baño reforma', 'Reforma del baño')).toBeGreaterThan(0);
  });

  it('ordena: exacto > empieza por > palabra que empieza > dentro de una palabra', () => {
    const exact = scoreMatch('baño', 'baño');
    const prefix = scoreMatch('baño', 'baño grande');
    const word = scoreMatch('baño', 'reforma baño');
    const inside = scoreMatch('baño', 'zonabaño');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });

  it('con la consulta vacía todo vale', () => {
    expect(scoreMatch('   ', 'cualquier cosa')).toBe(1);
  });

  it('a igual coincidencia gana el texto más corto', () => {
    expect(scoreMatch('luz', 'luz')).toBeGreaterThan(
      scoreMatch('luz', 'luz de la cocina del piso'),
    );
  });
});

describe('searchCommands', () => {
  it('sin consulta devuelve todos, con «Escribir una nota o tarea» el primero y los «Ir a» con su atajo', () => {
    const results = searchCommands('', context);

    expect(results[0]).toMatchObject({
      label: 'Escribir una nota o tarea',
      shortcut: ['/'],
      action: { type: 'start-capture' },
    });
    expect(results[1]?.label).toBe('Nueva tarjeta vacía');
    const go = results.filter((r) => r.label.startsWith('Ir a'));
    expect(go.map((r) => r.shortcut?.join(' '))).toEqual(['⇧N', '⇧L', '⇧C', '⇧G']);
    expect(results.at(-1)?.label).toBe('Cerrar sesión');
  });

  it('«ir a notas» y «notas» siguen encontrando Ir a Notas, y «gn» ya no es un atajo', () => {
    expect(searchCommands('ir a notas', context)[0]?.label).toBe('Ir a Notas');
    expect(searchCommands('notas', context).map((r) => r.label)).toContain('Ir a Notas');
    expect(searchCommands('gn', context)).toEqual([]);
  });

  it('«nota» encuentra la forma de escribir una nota y la tarjeta vacía', () => {
    const labels = searchCommands('nota', context).map((r) => r.label);
    expect(labels).toContain('Escribir una nota o tarea');
    expect(labels).toContain('Nueva tarjeta vacía');
  });

  it('filtra por etiqueta y por palabras clave', () => {
    expect(searchCommands('calend', context).map((r) => r.label)).toEqual(['Ir a Calendario']);
    expect(searchCommands('oscuro', context).map((r) => r.label)).toEqual(['Cambiar tema']);
    expect(searchCommands('salir', context)[0]?.label).toBe('Cerrar sesión');
  });

  it('enseña el tema actual y el usuario como pistas', () => {
    const all = searchCommands('', context);
    expect(all.find((r) => r.label === 'Cambiar tema')?.hint).toBe('ahora: Claro');
    expect(all.find((r) => r.label === 'Cerrar sesión')?.hint).toBe('martin');
  });

  it('una consulta sin coincidencias no devuelve nada', () => {
    expect(searchCommands('xyzzy', context)).toEqual([]);
  });
});

describe('búsqueda en datos', () => {
  it('listas: encuentra por nombre y por alias, y descarta archivadas', () => {
    const lists = [
      list(),
      list({ id: 'e'.repeat(24), name: 'Películas', slug: 'peliculas', captureAlias: 'peli' }),
      list({ id: 'f'.repeat(24), name: 'Baño viejo', slug: 'bano-viejo', archived: true }),
    ];

    expect(searchLists('bano', lists).map((r) => r.label)).toEqual(['Reforma del baño']);
    expect(searchLists('peli', lists).map((r) => r.label)).toEqual(['Películas']);
    expect(searchLists('bano', lists)[0]?.action).toEqual({
      type: 'go',
      url: '/listas/reforma-del-bano',
    });
  });

  it('tarjetas: enseñan su lista y se descartan las de listas desconocidas', () => {
    const lists = [list()];
    const items = [item(), item({ id: 'z'.repeat(24), listId: '9'.repeat(24) })];

    const results = itemResults('presupuesto', items, lists, true);

    expect(results).toHaveLength(1);
    expect(results[0]?.hint).toBe('Reforma del baño');
  });

  it('tarjetas: si la respuesta es antigua, solo quedan las que aún encajan', () => {
    const lists = [list()];
    const items = [item(), item({ id: 'y'.repeat(24), title: 'Comprar plato de ducha' })];

    expect(itemResults('presupuesto', items, lists, false)).toHaveLength(1);
    // Con la respuesta de la consulta actual, lo que el servidor devolvió se muestra (p. ej. por una etiqueta).
    expect(itemResults('presupuesto', items, lists, true)).toHaveLength(2);
  });

  it('notas: filtra por texto y enseña la línea que coincide', () => {
    const cards = [
      card('Llamar al fontanero\nPedir presupuesto del baño'),
      card('Comprar pan', { id: '1'.repeat(24) }),
    ];

    const results = searchNotes('presupuesto', cards);

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('Pedir presupuesto del baño');
    expect(results[0]?.action).toEqual({ type: 'go', url: '/notas' });
  });

  it('noteLine: primera línea, truncada y con aviso si está vacía', () => {
    expect(noteLine('\n  \n', '')).toBe('Nota vacía');
    expect(noteLine('uno\ndos', '')).toBe('uno');
    expect(noteLine('x'.repeat(200), '')).toHaveLength(90);
  });

  it('gastos: enseñan fecha e importe', () => {
    const [result] = expenseResults('cortina', [transaction()], true);

    expect(result?.label).toBe('Cortina de ducha');
    expect(result?.hint).toContain('02/11/2026');
    expect(result?.hint).toContain('24,90');
    expect(formatShortDate('2026-11-04')).toBe('04/11/2026');
  });
});

describe('groupResults', () => {
  const results: PaletteResult[] = [
    fake('command', 'Ir a Notas'),
    fake('expense', 'Cortina'),
    fake('item', 'Plato de ducha'),
    fake('note', 'Llamar'),
    fake('list', 'Reforma'),
    fake('item', 'Alicatado'),
  ];

  it('agrupa en el orden Listas · Tarjetas · Notas y gastos · Comandos y numera de corrido', () => {
    const groups = groupResults(results, 'all');

    expect(groups.map((g) => g.label)).toEqual([
      'Listas',
      'Tarjetas',
      'Notas y gastos',
      'Comandos',
    ]);
    expect(flattenGroups(groups).map((r) => [r.index, r.label])).toEqual([
      [0, 'Reforma'],
      [1, 'Plato de ducha'],
      [2, 'Alicatado'],
      [3, 'Cortina'],
      [4, 'Llamar'],
      [5, 'Ir a Notas'],
    ]);
  });

  it('el título del grupo de notas y gastos dice lo que contiene', () => {
    expect(groupResults([fake('note', 'a')], 'all')[0]?.label).toBe('Notas');
    expect(groupResults([fake('expense', 'a')], 'all')[0]?.label).toBe('Gastos');
  });

  it('un filtro deja solo su tipo; «Listas» incluye también las tarjetas', () => {
    expect(groupResults(results, 'lists').map((g) => g.id)).toEqual(['lists', 'cards']);
    expect(groupResults(results, 'notes').flatMap((g) => g.rows.map((r) => r.kind))).toEqual([
      'note',
    ]);
    expect(groupResults(results, 'expenses').flatMap((g) => g.rows.map((r) => r.kind))).toEqual([
      'expense',
    ]);
    expect(matchesFilter('capture', 'commands')).toBe(true);
    expect(matchesFilter('capture', 'notes')).toBe(false);
  });

  it('recorta cada tipo, con más margen cuando hay un filtro', () => {
    const many = Array.from({ length: 20 }, (_, i) => fake('item', `t${i}`));

    expect(flattenGroups(groupResults(many, 'all'))).toHaveLength(6);
    expect(flattenGroups(groupResults(many, 'lists'))).toHaveLength(12);
  });

  it('el tope es por tipo: muchas notas no esconden los gastos del mismo grupo', () => {
    const mixed = [
      ...Array.from({ length: 10 }, (_, i) => fake('note', `n${i}`)),
      fake('expense', 'Cortina'),
    ];

    const rows = flattenGroups(groupResults(mixed, 'all'));

    expect(rows.filter((r) => r.kind === 'note')).toHaveLength(5);
    expect(rows.filter((r) => r.kind === 'expense')).toHaveLength(1);
  });

  it('sin resultados no hay grupos', () => {
    expect(groupResults([], 'all')).toEqual([]);
  });

  it('«Capturar» va en el grupo de comandos', () => {
    const [group] = groupResults([captureResult('hola', 'Nota nueva')], 'all');
    expect(group?.label).toBe('Comandos');
    expect(group?.rows[0]?.label).toBe('Capturar: hola');
  });

  it('sortByScore ordena de mayor a menor y respeta los empates', () => {
    const sorted = sortByScore([fake('list', 'a', 1), fake('list', 'b', 3), fake('list', 'c', 1)]);
    expect(sorted.map((r) => r.label)).toEqual(['b', 'a', 'c']);
  });
});

describe('navegación con teclado', () => {
  it('moveSelection da la vuelta por los extremos', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(0);
  });

  it('cycleFilter recorre Todo · Listas · Notas · Gastos · Comandos en los dos sentidos', () => {
    expect(cycleFilter('all', 1)).toBe('lists');
    expect(cycleFilter('lists', 1)).toBe('notes');
    expect(cycleFilter('expenses', 1)).toBe('commands');
    expect(cycleFilter('commands', 1)).toBe('all');
    expect(cycleFilter('all', -1)).toBe('commands');
  });
});

describe('highlightSegments', () => {
  const joined = (parts: { text: string; match: boolean }[]) => parts.map((p) => p.text).join('');

  it('marca la coincidencia sin tocar el texto', () => {
    const parts = highlightSegments('Reforma del baño', 'ban');
    expect(joined(parts)).toBe('Reforma del baño');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['bañ']);
  });

  it('ignora tildes y mayúsculas', () => {
    const parts = highlightSegments('Café con leche', 'CAFE');
    expect(parts).toEqual([
      { text: 'Café', match: true },
      { text: ' con leche', match: false },
    ]);
  });

  it('marca cada palabra escrita y funde los solapes', () => {
    const parts = highlightSegments('Llamar al fontanero', 'fon llam');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Llam', 'fon']);
    expect(highlightSegments('abcdef', 'abc cde')).toEqual([
      { text: 'abcde', match: true },
      { text: 'f', match: false },
    ]);
  });

  it('sin consulta o sin coincidencia devuelve el texto entero', () => {
    expect(highlightSegments('Dune', '')).toEqual([{ text: 'Dune', match: false }]);
    expect(highlightSegments('Dune', 'zzz')).toEqual([{ text: 'Dune', match: false }]);
  });
});
