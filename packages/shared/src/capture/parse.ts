import { DEFAULT_TIME_ZONE, addDays, todayIn } from '../dates';
import { extractPrice } from './price';
import type { CaptureItem, CaptureResult, ParseOptions } from './types';

/** Default aliases, the ones from the list presets. */
export const DEFAULT_LIST_ALIASES: readonly string[] = ['peli', 'compra'];

/** List that dated tasks go to (`hoy:` / `mañana:`). */
export const TASK_LIST_ALIAS = 'tarea';

/** Date prefixes: normalized name -> offset in days from today. */
const DATE_PREFIXES: Record<string, number> = { hoy: 0, manana: 1 };

/** A prefix is a short word, so `https://...` or `10:30 llamar` are not read as a prefix. */
const PREFIX_RE = /^\p{L}[\p{L}\p{N} _-]{0,29}$/u;

const TAG_RE = /^#((?=[\p{N}_-]*\p{L})[\p{L}\p{N}_-]+)[.,;:!?]*$/u;
const CATEGORY_RE = /^@([\p{L}\p{N}_-]+)[.,;:!?]*$/u;
const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;

interface Features {
  tags: boolean;
  url: boolean;
  category: boolean;
  price: boolean;
}

const LIST_FEATURES: Features = { tags: true, url: true, category: true, price: true };
/** In a dated task, @category and amounts are not interpreted: they are plain text. */
const TASK_FEATURES: Features = { tags: true, url: true, category: false, price: false };

function normalizePrefix(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchUrl(token: string): string | null {
  if (!URL_RE.test(token)) return null;
  const candidate = token.replace(/[.,;:!?]+$/, '');
  const href = candidate.toLowerCase().startsWith('www.') ? `https://${candidate}` : candidate;
  try {
    new URL(href);
    return href;
  } catch {
    return null;
  }
}

function parseBody(body: string, features: Features) {
  const tags: string[] = [];
  const kept: string[] = [];
  let url: string | undefined;
  let category: string | undefined;

  for (const token of body.split(/\s+/)) {
    if (!token) continue;

    if (features.tags) {
      const tag = TAG_RE.exec(token)?.[1]?.toLowerCase();
      if (tag) {
        if (!tags.includes(tag)) tags.push(tag);
        continue;
      }
    }
    if (features.url && url === undefined) {
      const found = matchUrl(token);
      if (found) {
        url = found;
        continue;
      }
    }
    if (features.category && category === undefined) {
      const found = CATEGORY_RE.exec(token)?.[1];
      if (found) {
        category = found;
        continue;
      }
    }
    kept.push(token);
  }

  let title = kept.join(' ');
  let priceCents: number | undefined;
  if (features.price) {
    const price = extractPrice(title);
    if (price) {
      priceCents = price.cents;
      title = price.rest;
    }
  }

  return { title, tags, category, url, priceCents };
}

/**
 * Parses a quick-capture line. Pure function; it never throws because of the content:
 * anything not recognized ends up in the daily note.
 *
 *   peli: Dune #scifi                       -> item in the `peli` list
 *   compra: Cafetera @hogar 89€ https://...  -> item with category, price and link
 *   hoy: llamar al dentista / mañana: ...    -> dated task
 *   anything else                            -> daily note
 */
export function parseQuickCapture(input: string, options: ParseOptions = {}): CaptureResult {
  // NFC: a keyboard that emits "n" plus a combining tilde must still match "mañana".
  const text = input.normalize('NFC').trim();
  if (!text) return { kind: 'empty', reason: 'blank' };

  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const aliases = new Map<string, string>();
  for (const alias of options.aliases ?? DEFAULT_LIST_ALIASES) {
    aliases.set(normalizePrefix(alias), alias);
  }

  const noteReason = (reason: 'no_prefix' | 'unknown_prefix'): CaptureResult => ({
    kind: 'daily_note',
    date: todayIn(timeZone, now),
    text,
    reason,
  });

  const colon = text.indexOf(':');
  const rawPrefix = colon > 0 ? text.slice(0, colon) : '';
  const body = colon > 0 ? text.slice(colon + 1) : '';
  if (!PREFIX_RE.test(rawPrefix) || body.startsWith('//')) return noteReason('no_prefix');

  const prefix = normalizePrefix(rawPrefix);
  const dayOffset = DATE_PREFIXES[prefix];
  const listAlias = aliases.get(prefix);
  if (dayOffset === undefined && listAlias === undefined) return noteReason('unknown_prefix');

  const isTask = dayOffset !== undefined;
  const parsed = parseBody(body, isTask ? TASK_FEATURES : LIST_FEATURES);
  if (!parsed.title) return { kind: 'empty', reason: 'no_title' };

  const item: CaptureItem = {
    kind: 'item',
    list: isTask ? TASK_LIST_ALIAS : listAlias!,
    title: parsed.title,
    tags: parsed.tags,
  };
  if (parsed.category !== undefined) item.category = parsed.category;
  if (parsed.priceCents !== undefined) item.priceCents = parsed.priceCents;
  if (parsed.url !== undefined) item.url = parsed.url;
  if (isTask) item.dueDate = addDays(todayIn(timeZone, now), dayOffset);
  return item;
}
