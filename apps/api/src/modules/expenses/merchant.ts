import { normalizeDescription } from './normalize';

/**
 * Pasarelas de cobro: el comercio real va detrás del asterisco (`SumUp  *Churreria Luis`).
 * En el resto de casos con asterisco manda lo de delante (`AMAZON* C74AK2N75`, `OPENAI *CHATGPT`).
 */
const PROCESSORS = new Set(['sumup', 'zettle', 'paypal', 'sq', 'sumup.com']);

/** Conceptos sin información propia: agrupar por ellos mezclaría cosas sin relación. */
const GENERIC = new Set([
  'sin concepto',
  'transferencia',
  'bizum',
  'recibo',
  'traspaso',
  'ingreso',
  'pago',
  'compra',
]);

const MAX_LENGTH = 40;

/**
 * Clave estable del comercio de un movimiento, para agrupar y aprender de él:
 * `SumUp  *Racing camel Villadangos d 20334` → `racing camel villadangos d`,
 * `FROIZ CANGAS 1      \CANGAS\ES2409031331` → `froiz cangas 1`.
 * Quita la localidad y la referencia de la terminal (lo que va tras la primera `\`), los tokens
 * con dígitos mezclados y los números sueltos largos. Devuelve `null` si no queda nada útil.
 */
export function merchantKey(description: string): string | null {
  let text = normalizeDescription(description);

  const backslash = text.indexOf('\\');
  if (backslash !== -1) text = text.slice(0, backslash);

  const star = text.indexOf('*');
  if (star !== -1) {
    const before = text.slice(0, star).trim();
    text = PROCESSORS.has(before) || before === '' ? text.slice(star + 1) : before;
  }

  const tokens = text
    .replace(/[^\p{L}\p{N}\s.&-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token !== '' && token !== '-' && !/\d/.test(token.replace(/^\d{1,2}$/, '')))
    .map((token) => token.replace(/^[.&-]+|[.&-]+$/g, ''))
    .filter((token) => token !== '');

  const key = tokens.join(' ').slice(0, MAX_LENGTH).trim();
  if (key.length < 3 || GENERIC.has(key)) return null;
  return key;
}
