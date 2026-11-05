/**
 * Amounts in Spanish format: `89€`, `89,50€`, `€89`, `89 eur`, `1.299,99€`.
 * Returns integer cents (never through floats) and the text without the amount.
 *
 * Ambiguity rules: `1.299` (dot + 3 digits) is read as a thousands separator; `89.50` (dot + 1-2
 * digits) as a decimal. Only recognized with a euro marker, so "Dune 2" is not read as 2 EUR.
 */
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

const PRICE_RE = new RegExp(
  String.raw`(?<!\S)(?:€\s?(${NUM})|(${NUM})\s?(?:€|eur(?:os?)?(?![\p{L}\p{N}])))[.,;:!?]*(?=\s|$)`,
  'iu',
);

const THOUSANDS_RE = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;

function toCents(raw: string): number | null {
  const normalized = THOUSANDS_RE.test(raw) ? raw.replace(/\./g, '') : raw;
  const [intPart = '0', decPart = ''] = normalized.replace(',', '.').split('.');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export interface ExtractedPrice {
  cents: number;
  /** Original text without the amount, with whitespace normalized. */
  rest: string;
}

/** Extracts the first amount in the text; any others stay in the title. */
export function extractPrice(text: string): ExtractedPrice | null {
  const match = PRICE_RE.exec(text);
  if (!match) return null;
  const cents = toCents((match[1] ?? match[2])!);
  if (cents === null) return null;
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();
  return { cents, rest };
}
