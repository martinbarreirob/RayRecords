import {
  TASK_LIST_ALIAS,
  type CaptureItem,
  type CaptureResult,
  type List,
} from '@rayrecords/shared';
import { normalize } from '../../core/palette/palette-logic';
import { closestPrefix, listLikePrefix, type PrefixOption } from './capture-prefix';

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** Destination of what goes to no list: a card on the Notas canvas. */
export const NOTE_DESTINATION = 'Nota suelta en el lienzo';

/** The list with that alias (ignoring case and accents), if the lists have already loaded. */
function listOf(alias: string, lists: readonly List[] | null): List | undefined {
  return lists?.find((list) => list.captureAlias === alias);
}

/** Name of the target list by its alias; while the lists have not loaded, the alias itself. */
function listNameOf(result: CaptureItem, lists: readonly List[] | null): string {
  return listOf(result.list, lists)?.name ?? result.list;
}

/** A piece of data the parser recognized in the text. */
export interface CaptureExtra {
  kind: 'date' | 'tags' | 'category' | 'price' | 'url';
  text: string;
}

/** What goes with the title: date, tags, category, price and link. */
function itemExtras(result: CaptureItem, formatDate: (date: string) => string): CaptureExtra[] {
  const extras: CaptureExtra[] = [];
  if (result.dueDate) extras.push({ kind: 'date', text: `para el ${formatDate(result.dueDate)}` });
  if (result.tags.length) {
    extras.push({ kind: 'tags', text: result.tags.map((tag) => `#${tag}`).join(' ') });
  }
  if (result.category) extras.push({ kind: 'category', text: `@${result.category}` });
  if (result.priceCents !== undefined) {
    extras.push({ kind: 'price', text: euros.format(result.priceCents / 100) });
  }
  if (result.url) extras.push({ kind: 'url', text: 'con enlace' });
  return extras;
}

/** Readable summary of how a capture was interpreted, to show while typing. */
export function describeCapture(result: CaptureResult, lists: readonly List[] | null): string {
  switch (result.kind) {
    case 'empty':
      return result.reason === 'no_title' ? 'Falta el título' : '';
    case 'daily_note':
      return 'Nota nueva';
    case 'item':
      return [
        `${listNameOf(result, lists)}: ${result.title}`,
        ...itemExtras(result, (date) => date).map((extra) => extra.text),
      ].join(' · ');
  }
}

/** Capture preview: where it will go, what will be saved and what to warn about. */
export interface CapturePreview {
  /** `list`: a list; `note`: loose card on the canvas; `none`: it cannot be saved. */
  target: 'list' | 'note' | 'none';
  /** The list name, "Nota suelta en el lienzo" or "Falta el título". */
  destination: string;
  /** Address of the target list, if known. */
  listSlug?: string;
  /** The title (or the whole text of a note). */
  title: string;
  /** Recognized date, tags, category, amount and link. */
  extras: CaptureExtra[];
  /** Discreet warning (a prefix that is not a list, a missing list...); empty if none. */
  notice: string;
  /** The capture cannot be saved as is. */
  incomplete: boolean;
}

/** Extra context to refine the warnings: the typed text and the prefixes that exist. */
export interface PreviewContext {
  text: string;
  prefixes: readonly PrefixOption[];
}

/** "2026-11-04" to "4 nov". */
export function friendlyDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return DAY.format(new Date(year, month - 1, day)).replace(/\./g, '');
}

/** Warning for a prefix that looks like a list one but is not: with the most likely correction if any. */
function unknownPrefixNotice(raw: string, prefixes: readonly PrefixOption[]): string {
  const close = closestPrefix(raw, prefixes);
  return close
    ? `«${raw}:» no es una lista. ¿Querías «${close.prefix}:»? Se guardará como nota.`
    : `No hay ninguna lista con el prefijo «${raw}:». Se guardará como nota, con el texto entero.`;
}

/** With `no_title` the parser does not say the list; the prefix is resolved by hand to be able to name it. */
function emptyTitleTarget(
  context: PreviewContext | undefined,
  lists: readonly List[] | null,
): { destination: string; listSlug?: string; prefix: string } | null {
  const raw = context ? listLikePrefix(context.text) : null;
  if (!raw) return null;
  const typed = normalize(raw);
  const known = context!.prefixes.find((option) => normalize(option.prefix) === typed);
  if (!known) return null;
  // "hoy:" and "mañana:" go to the list with the tasks alias.
  const isDate = typed === 'hoy' || typed === 'manana';
  const list = listOf(isDate ? TASK_LIST_ALIAS : known.prefix, lists);
  return { destination: list?.name ?? known.label, listSlug: list?.slug, prefix: raw };
}

export function previewCapture(
  result: CaptureResult,
  lists: readonly List[] | null,
  context?: PreviewContext,
): CapturePreview | null {
  switch (result.kind) {
    case 'empty': {
      if (result.reason !== 'no_title') return null;
      const target = emptyTitleTarget(context, lists);
      return {
        target: target ? 'list' : 'none',
        destination: target?.destination ?? 'Falta el título',
        ...(target?.listSlug && { listSlug: target.listSlug }),
        title: '',
        extras: [],
        notice: target ? `Escribe el título después de «${target.prefix}:».` : '',
        incomplete: true,
      };
    }
    case 'daily_note': {
      const raw =
        result.reason === 'unknown_prefix' && context ? listLikePrefix(context.text) : null;
      return {
        target: 'note',
        destination: NOTE_DESTINATION,
        title: result.text,
        extras: [],
        notice: raw && context ? unknownPrefixNotice(raw, context.prefixes) : '',
        incomplete: false,
      };
    }
    case 'item': {
      const list = listOf(result.list, lists);
      const extras = itemExtras(result, friendlyDate);
      // With the lists loaded and none with that alias, the server saves it as a note (e.g. `hoy:` without a tasks list).
      if (lists && !list) {
        const when = result.dueDate ? ` (para el ${friendlyDate(result.dueDate)})` : '';
        return {
          target: 'note',
          destination: NOTE_DESTINATION,
          title: `${result.title}${when}`,
          extras: extras.filter((extra) => extra.kind !== 'date'),
          notice: `No existe ninguna lista con el prefijo «${result.list}»: se guardará como nota.`,
          incomplete: false,
        };
      }
      return {
        target: 'list',
        destination: list?.name ?? result.list,
        ...(list && { listSlug: list.slug }),
        title: result.title,
        extras,
        notice: '',
        incomplete: false,
      };
    }
  }
}
