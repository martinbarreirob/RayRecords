import type { Suggestion } from '@rayrecords/shared';
import { categorize, type Rule } from './categorize';

/** Palabras que delatan la categoría de un comercio nuevo. Débiles: van detrás del historial y las reglas. */
const HINTS: readonly [RegExp, string][] = [
  [
    /(cafe|cafeteria|coffee|panader|pasteler|churrer|helad|pizz|burger|burguer|kebab|doner|restaur|taberna|ristorante|sushi|grill|tapas|asador|glovo)/,
    'restauracion',
  ],
  [/(farmacia|clinic|clin\.|dental|medic|optic|fisio|psicolog)/, 'salud'],
  [
    /(supermerc|froiz|eroski|mercadona|lidl|carrefour|alcampo|hiper|alquiler|naturgy|iberdrola|telefonica)/,
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
  /** Historial del comercio: categoría → nº de movimientos ya categorizados. */
  history: ReadonlyMap<string, number>;
  rules: readonly Rule[];
  /** Categorías más usadas en general, de más a menos. */
  popular: readonly string[];
  /** Claves de categorías que existen. */
  known: ReadonlySet<string>;
}

/**
 * Hasta `limit` categorías para un grupo pendiente, de más a menos fiable:
 * historial del comercio (la más repetida primero) → regla que coincide → heurística → más usadas.
 * Nunca repite categoría ni devuelve claves que no existen.
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
