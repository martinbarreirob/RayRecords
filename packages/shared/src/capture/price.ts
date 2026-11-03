/**
 * Importes en formato español: `89€`, `89,50€`, `€89`, `89 eur`, `1.299,99€`.
 * Devuelve céntimos enteros (sin pasar por floats) y el texto sin el importe.
 *
 * Reglas de ambigüedad: `1.299` (punto + 3 dígitos) se lee como millar; `89.50` (punto + 1-2
 * dígitos) como decimal. Solo se reconoce con símbolo de euro, para no confundir "Dune 2" con 2 €.
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
  /** Texto original sin el importe y con los espacios normalizados. */
  rest: string;
}

/** Extrae el primer importe del texto; los demás se quedan en el título. */
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
