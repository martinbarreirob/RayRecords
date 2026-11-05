import type { Suggestion } from '@rayrecords/shared';
import { categorize, type Rule } from './categorize';

/** Words that hint at a new merchant's category. Weak: they rank after history and rules. */
const HINTS: readonly [RegExp, string][] = [
  [
    /(cafe|cafeteria|coffee|panader|pasteler|churrer|helad|pizz|burger|burguer|kebab|doner|restaur|taberna|ristorante|sushi|grill|tapas|asador|glovo)/,
    'restauracion',
  ],
  [/(farmacia|clinic|clin\.|dental|medic|optic|fisio|psicolog)/, 'salud'],
  [
    /(supermerc|acme|eroski|mercadona|lidl|carrefour|alcampo|hiper|alquiler|naturgy|iberdrola|telefonica)/,
    'hogar',
  ],
  [/(gasolin|repsol|cepsa|parking|taller|itv|peaje|seguro|autoescuela|motor)/, 'coche'],
  [
    /(zara|bershka|pull|primark|stradivarius|mango|ropa|zapat|amazon|aliexpress|temu|wallapop|ebay|regalo)/,
    'compras',
  ],
  [
    /(netflix|spotify|hbo|disney|prime|youtube|icloud|apple\.com|openai|jetbrains)/,
    'suscripciones',
  ],
  [/(cine|teatro|concierto|entrada|decathlon|gimnas|deporte|sport|hotel)/, 'ocio'],
  [/(hal cash|reintegro|cajero|comision|revolut|bizum)/, 'traspaso'],
];

export interface SuggestInput {
  merchantKey: string | null;
  descriptionNorm: string;
  totalCents: number;
  /** Merchant history: category to number of already categorized transactions. */
  history: ReadonlyMap<string, number>;
  rules: readonly Rule[];
  /** Most used categories overall, most used first. */
  popular: readonly string[];
  /** Keys of categories that exist. */
  known: ReadonlySet<string>;
}

/**
 * Up to `limit` categories for a pending group, most reliable first: merchant history (most
 * repeated first), then a matching rule, then the hints, then the most used.
 * Never repeats a category or returns keys that do not exist.
 */
export function suggest(input: SuggestInput, limit = 4): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (category: string | null, source: Suggestion['source'], count = 0) => {
    if (!category || !input.known.has(category) || out.some((s) => s.category === category)) return;
    if (out.length < limit) out.push({ category, source, count });
  };

  [...input.history.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => add(category, 'history', count));

  add(categorize(input.descriptionNorm, input.rules), 'rule');

  const text = input.merchantKey ?? input.descriptionNorm;
  for (const [pattern, category] of HINTS) if (pattern.test(text)) add(category, 'hint');
  if (input.totalCents > 0) add('ingresos', 'hint');

  input.popular.forEach((category) => add(category, 'popular'));
  return out;
}
