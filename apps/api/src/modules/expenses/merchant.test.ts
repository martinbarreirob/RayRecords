import { describe, expect, it } from 'vitest';
import { merchantKey } from './merchant';

describe('merchantKey', () => {
  it.each([
    ['FROIZ CANGAS 1      \CANGAS\ES2409031331', 'froiz cangas 1'],
    ['FROIZ - CANGAS 2    \CANGAS\ES2408292044', 'froiz cangas 2'],
    ['SumUp  *Racing camel Villadangos d 20334', 'racing camel villadangos d'],
    ['SumUp  *Churreria Luis Ourense 203345091', 'churreria luis ourense'],
    ['AMAZON* C74AK2N75 LUXEMBOURG 000000000', 'amazon'],
    ['Amazon Prime*QR8CL7U55 amazon.es/prm 445', 'amazon prime'],
    ['OPENAI *CHATGPT SUBSCR SAN FRANCISCO 000', 'openai'],
    ['CHIRINGO O POR\\CANGAS DO MO\\ES2408300019', 'chiringo o por'],
    ['COMISION HAL CASH ID: 002091007709495', 'comision hal cash id'],
    ['regalo panchuki', 'regalo panchuki'],
  ])('%s → %s', (description, expected) => {
    expect(merchantKey(description)).toBe(expected);
  });

  it('devuelve null si no hay información útil', () => {
    expect(merchantKey('Sin concepto')).toBeNull();
    expect(merchantKey('\CANGAS\ES2409031331')).toBeNull();
    expect(merchantKey('12345')).toBeNull();
  });
});
