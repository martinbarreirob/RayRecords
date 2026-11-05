import { normalizeDescription } from './normalize';

/**
 * Payment gateways: the real merchant comes after the asterisk (`SumUp  *Churreria Luis`).
 * In every other asterisk case the part before it wins (`AMAZON* C74AK2N75`, `OPENAI *CHATGPT`).
 */
const PROCESSORS = new Set(['sumup', 'zettle', 'paypal', 'sq', 'sumup.com']);

/** Concepts with no information of their own: grouping by them would mix unrelated things. */
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
 * Stable merchant key of a transaction, used to group and learn from it:
 * `SumUp  *Racing camel Villadangos d 20334` becomes `racing camel villadangos d`,
 * `ACME TOWN 1      \TOWN\ES2409031331` becomes `acme town 1`.
 * Drops the town and terminal reference (everything after the first `\`), tokens mixing digits,
 * and long standalone numbers. Returns `null` when nothing useful is left.
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
