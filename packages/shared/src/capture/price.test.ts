import { describe, expect, it } from 'vitest';
import { extractPrice } from './price';

describe('extractPrice', () => {
  it.each([
    ['89€', 8900],
    ['89 €', 8900],
    ['€89', 8900],
    ['€ 89,5', 8950],
    ['89,50€', 8950],
    ['89.50€', 8950],
    ['89.5€', 8950],
    ['89 eur', 8900],
    ['89 EUR', 8900],
    ['89 euro', 8900],
    ['89 euros', 8900],
    ['0€', 0],
    ['0,99€', 99],
    ['1.299€', 129_900],
    ['1.299,99€', 129_999],
    ['12.345,6€', 1_234_560],
  ])('lee "%s" como %i céntimos', (input, cents) => {
    expect(extractPrice(input)?.cents).toBe(cents);
  });

  it.each(['89', 'Dune 2', 'eurostar 100', 'a89€', '2x1€', '89,505€', '€', 'sin precio'])(
    'no confunde "%s" con un importe',
    (input) => {
      expect(extractPrice(input)).toBeNull();
    },
  );

  it('devuelve el texto sin el importe y con espacios normalizados', () => {
    expect(extractPrice('Cafetera 89€')?.rest).toBe('Cafetera');
    expect(extractPrice('cuesta 89 € hoy')?.rest).toBe('cuesta hoy');
    expect(extractPrice('89€ Cafetera')?.rest).toBe('Cafetera');
  });

  it('absorbe la puntuación que sigue al importe', () => {
    expect(extractPrice('89€.')).toEqual({ cents: 8900, rest: '' });
    expect(extractPrice('precio 89,50€, ok')).toEqual({ cents: 8950, rest: 'precio ok' });
  });

  it('solo extrae el primer importe', () => {
    expect(extractPrice('lote 10€ 20€')).toEqual({ cents: 1000, rest: 'lote 20€' });
  });

  it('descarta importes que no caben en un entero seguro', () => {
    expect(extractPrice('99999999999999999999€')).toBeNull();
  });
});
