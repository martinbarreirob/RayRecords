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
  it('nombra la lista por su alias cuando está cargada', () => {
    expect(describe_('peli: Dune #scifi', [films])).toBe('Películas: Dune · #scifi');
  });

  it('usa el alias como nombre mientras las listas no han cargado', () => {
    expect(describe_('peli: Dune')).toBe('peli: Dune');
  });

  it('resume precio, categoría y enlace de una compra', () => {
    const text = describe_('compra: Cafetera @hogar 89€ https://tienda.com/p');
    expect(text).toContain('compra: Cafetera');
    expect(text).toContain('@hogar');
    expect(text).toContain('89,00');
    expect(text).toContain('con enlace');
  });

  it('indica la fecha de las tareas', () => {
    expect(describe_('mañana: llamar al dentista')).toBe(
      'tarea: llamar al dentista · para el 2026-11-04',
    );
  });

  it('describe una nota nueva como destino por defecto', () => {
    expect(describe_('una idea suelta')).toBe('Nota nueva');
  });

  it('avisa del prefijo sin título y calla con la entrada vacía', () => {
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

  it('«compra: leche» va a la lista Compras, con su título', () => {
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

  it('reconoce etiquetas, categoría, importe y enlace', () => {
    const result = preview('compra: Cafetera @hogar #regalo 89,50€ https://tienda.com/p');
    expect(result?.title).toBe('Cafetera');
    expect(result?.extras.map((extra) => extra.kind)).toEqual(['tags', 'category', 'price', 'url']);
    expect(result?.extras.find((extra) => extra.kind === 'price')?.text).toContain('89,50');
  });

  it('«mañana:» es una tarea con fecha corta y va a la lista de tareas', () => {
    const result = preview('mañana: llamar al dentista');
    expect(result).toMatchObject({
      target: 'list',
      destination: 'Tareas',
      title: 'llamar al dentista',
    });
    expect(result?.extras).toEqual([{ kind: 'date', text: 'para el 4 nov' }]);
  });

  it('sin lista de tareas, «hoy:» se previsualiza como nota con aviso (igual que el servidor)', () => {
    const result = preview('hoy: pagar el recibo', [films, shopping]);
    expect(result).toMatchObject({ target: 'note', destination: NOTE_DESTINATION });
    expect(result?.title).toBe('pagar el recibo (para el 3 nov)');
    expect(result?.notice).toContain('tarea');
  });

  it('sin prefijo es una nota suelta en el lienzo, sin avisos', () => {
    expect(preview('una idea suelta')).toEqual({
      target: 'note',
      destination: NOTE_DESTINATION,
      title: 'una idea suelta',
      extras: [],
      notice: '',
      incomplete: false,
    });
  });

  it('un prefijo que parece una lista pero no existe avisa, y propone el parecido', () => {
    expect(preview('idea: probar el tema oscuro')?.notice).toContain('No hay ninguna lista');
    expect(preview('compras: leche')?.notice).toContain('¿Querías «compra:»?');
    expect(preview('compras: leche')?.target).toBe('note');
  });

  it('una frase con dos puntos no se toma por una lista: sin aviso', () => {
    expect(preview('reunión con Ana: preparar el informe')?.notice).toBe('');
    expect(preview('10:30 llamar')?.notice).toBe('');
  });

  it('un prefijo sin título es incompleto y nombra la lista', () => {
    expect(preview('compra:')).toMatchObject({
      target: 'list',
      destination: 'Compras',
      incomplete: true,
      notice: 'Escribe el título después de «compra:».',
    });
  });

  it('no dice nada con la entrada vacía', () => {
    expect(preview('   ')).toBeNull();
  });

  it('mientras las listas no han cargado usa el alias como nombre y no avisa de listas que faltan', () => {
    const result = preview('peli: Dune', null);
    expect(result).toMatchObject({ target: 'list', destination: 'peli', notice: '' });
  });

  it('sin el contexto, un prefijo sin título es «Falta el título»', () => {
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
  it('abrevia el mes y deja intacto lo que no es una fecha', () => {
    expect(friendlyDate('2026-11-04')).toBe('4 nov');
    expect(friendlyDate('mañana')).toBe('mañana');
  });
});
