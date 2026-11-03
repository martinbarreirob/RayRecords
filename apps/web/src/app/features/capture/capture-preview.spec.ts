import { parseQuickCapture, type List } from '@rayrecords/shared';
import { describeCapture } from './capture-preview';

const now = new Date('2026-11-03T10:00:00Z');
const describe_ = (input: string, lists: List[] | null = null) =>
  describeCapture(parseQuickCapture(input, { now }), lists);

const films = { captureAlias: 'peli', name: 'Películas' } as List;

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

  it('describe la nota del día como destino por defecto', () => {
    expect(describe_('una idea suelta')).toBe('Nota del día 2026-11-03');
  });

  it('avisa del prefijo sin título y calla con la entrada vacía', () => {
    expect(describe_('peli:')).toBe('Falta el título');
    expect(describe_('   ')).toBe('');
  });
});
