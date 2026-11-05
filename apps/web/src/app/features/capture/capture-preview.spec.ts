import { parseQuickCapture, type List } from '@rayrecords/shared';
import { prefixOptions } from './capture-prefix';
import { NOTE_DESTINATION, describeCapture, friendlyDate, previewCapture } from './capture-preview';

const now = new Date('2026-11-03T10:00:00Z');
const describe_ = (input: string, lists: List[] | null = null) =>
  describeCapture(parseQuickCapture(input, { now }), lists);

const list = (name: string, slug: string, captureAlias: string): List =>
  ({ name, slug, captureAlias, archived: false }) as List;
const films = list('Películas', 'peliculas', 'peli');
const shopping = list('Compras', 'compras', 'compra');
const tasks = list('Tareas', 'tareas', 'tarea');

describe('describeCapture', () => {
  it('names the list by its alias when loaded', () => {
    expect(describe_('peli: Dune #scifi', [films])).toBe('Películas: Dune · #scifi');
  });

  it('uses the alias as the name while lists have not loaded', () => {
    expect(describe_('peli: Dune')).toBe('peli: Dune');
  });

  it('summarizes price, category and link of a purchase', () => {
    const text = describe_('compra: Cafetera @hogar 89€ https://tienda.com/p');
    expect(text).toContain('compra: Cafetera');
    expect(text).toContain('@hogar');
    expect(text).toContain('89,00');
    expect(text).toContain('con enlace');
  });

  it('shows the date of tasks', () => {
    expect(describe_('mañana: llamar al dentista')).toBe(
      'tarea: llamar al dentista · para el 2026-11-04',
    );
  });

  it('describes a new note as the default destination', () => {
    expect(describe_('una idea suelta')).toBe('Nota nueva');
  });

  it('warns about a prefix without a title and stays quiet on empty input', () => {
    expect(describe_('peli:')).toBe('Falta el título');
    expect(describe_('   ')).toBe('');
  });
});

describe('previewCapture', () => {
  const lists = [films, shopping, tasks];
  const preview = (input: string, loaded: List[] | null = lists) => {
    const parsed = parseQuickCapture(input, { now, aliases: loaded?.map((l) => l.captureAlias!) });
    return previewCapture(parsed, loaded, { text: input, prefixes: prefixOptions(loaded) });
  };

  it('"compra: leche" goes to the Compras list, with its title', () => {
    expect(preview('compra: leche semidesnatada')).toEqual({
      target: 'list',
      destination: 'Compras',
      listSlug: 'compras',
      title: 'leche semidesnatada',
      extras: [],
      notice: '',
      incomplete: false,
    });
  });

  it('recognizes tags, category, amount and link', () => {
    const result = preview('compra: Cafetera @hogar #regalo 89,50€ https://tienda.com/p');
    expect(result?.title).toBe('Cafetera');
    expect(result?.extras.map((extra) => extra.kind)).toEqual(['tags', 'category', 'price', 'url']);
    expect(result?.extras.find((extra) => extra.kind === 'price')?.text).toContain('89,50');
  });

  it('"mañana:" is a task with a short date and goes to the tasks list', () => {
    const result = preview('mañana: llamar al dentista');
    expect(result).toMatchObject({
      target: 'list',
      destination: 'Tareas',
      title: 'llamar al dentista',
    });
    expect(result?.extras).toEqual([{ kind: 'date', text: 'para el 4 nov' }]);
  });

  it('without a tasks list, "hoy:" is previewed as a note with a warning (same as the server)', () => {
    const result = preview('hoy: pagar el recibo', [films, shopping]);
    expect(result).toMatchObject({ target: 'note', destination: NOTE_DESTINATION });
    expect(result?.title).toBe('pagar el recibo (para el 3 nov)');
    expect(result?.notice).toContain('tarea');
  });

  it('without a prefix it is a loose note on the canvas, no warnings', () => {
    expect(preview('una idea suelta')).toEqual({
      target: 'note',
      destination: NOTE_DESTINATION,
      title: 'una idea suelta',
      extras: [],
      notice: '',
      incomplete: false,
    });
  });

  it('a prefix that looks like a list but does not exist warns and suggests the similar one', () => {
    expect(preview('idea: probar el tema oscuro')?.notice).toContain('No hay ninguna lista');
    expect(preview('compras: leche')?.notice).toContain('¿Querías «compra:»?');
    expect(preview('compras: leche')?.target).toBe('note');
  });

  it('a sentence with a colon is not taken for a list: no warning', () => {
    expect(preview('reunión con Ana: preparar el informe')?.notice).toBe('');
    expect(preview('10:30 llamar')?.notice).toBe('');
  });

  it('a prefix without a title is incomplete and names the list', () => {
    expect(preview('compra:')).toMatchObject({
      target: 'list',
      destination: 'Compras',
      incomplete: true,
      notice: 'Escribe el título después de «compra:».',
    });
  });

  it('says nothing on empty input', () => {
    expect(preview('   ')).toBeNull();
  });

  it('while lists have not loaded it uses the alias as the name and does not warn about missing lists', () => {
    const result = preview('peli: Dune', null);
    expect(result).toMatchObject({ target: 'list', destination: 'peli', notice: '' });
  });

  it('without the context, a prefix without a title is "Falta el título"', () => {
    expect(previewCapture(parseQuickCapture('peli:', { now }), null)).toEqual({
      target: 'none',
      destination: 'Falta el título',
      title: '',
      extras: [],
      notice: '',
      incomplete: true,
    });
  });
});

describe('friendlyDate', () => {
  it('abbreviates the month and leaves non-dates untouched', () => {
    expect(friendlyDate('2026-11-04')).toBe('4 nov');
    expect(friendlyDate('mañana')).toBe('mañana');
  });
});
