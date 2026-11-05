import { describe, expect, it } from 'vitest';
import { merchantKey } from './merchant';

describe('merchantKey', () => {
  it.each([
    ['ACME TOWN 1      \TOWN\ES2409031331', 'acme town 1'],
    ['ACME - TOWN 2    \TOWN\ES2408292044', 'acme town 2'],
    ['SumUp  *Racing camel Villadangos d 20334', 'racing camel villadangos d'],
    ['SumUp  *Churreria Luis Ourense 203345091', 'churreria luis ourense'],
    ['AMAZON* C74AK2N75 LUXEMBOURG 000000000', 'amazon'],
    ['Amazon Prime*QR8CL7U55 amazon.es/prm 445', 'amazon prime'],
    ['OPENAI *CHATGPT SUBSCR SAN FRANCISCO 000', 'openai'],
    ['BEACH BAR\\SOME TOWN\\ES2408300019', 'beach bar'],
    ['COMISION HAL CASH ID: 002091007709495', 'comision hal cash id'],
    ['regalo panchuki', 'regalo panchuki'],
  ])('%s → %s', (description, expected) => {
    expect(merchantKey(description)).toBe(expected);
  });

  it('returns null when there is no useful information', () => {
    expect(merchantKey('Sin concepto')).toBeNull();
    expect(merchantKey('\TOWN\ES2409031331')).toBeNull();
    expect(merchantKey('12345')).toBeNull();
  });
});
