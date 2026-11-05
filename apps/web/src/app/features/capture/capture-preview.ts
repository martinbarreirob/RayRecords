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

/** Destino de lo que no va a ninguna lista: una tarjeta en el lienzo de Notas. */
export const NOTE_DESTINATION = 'Nota suelta en el lienzo';

/** La lista con ese alias (sin importar mayúsculas ni tildes), si las listas ya han cargado. */
function listOf(alias: string, lists: readonly List[] | null): List | undefined {
  return lists?.find((list) => list.captureAlias === alias);
}

/** Nombre de la lista destino por su alias; mientras las listas no han cargado, el propio alias. */
function listNameOf(result: CaptureItem, lists: readonly List[] | null): string {
  return listOf(result.list, lists)?.name ?? result.list;
}

/** Un dato que el parser ha reconocido en el texto. */
export interface CaptureExtra {
  kind: 'date' | 'tags' | 'category' | 'price' | 'url';
  text: string;
}

/** Lo que acompaña al título: fecha, etiquetas, categoría, precio y enlace. */
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

/** Resumen legible de cómo se ha interpretado una captura, para mostrarlo mientras se escribe. */
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

/** Vista previa de la captura: adónde irá, qué se guardará y qué avisar. */
export interface CapturePreview {
  /** `list`: una lista; `note`: tarjeta suelta en el lienzo; `none`: no se puede guardar. */
  target: 'list' | 'note' | 'none';
  /** El nombre de la lista, «Nota suelta en el lienzo» o «Falta el título». */
  destination: string;
  /** Dirección de la lista destino, si se conoce. */
  listSlug?: string;
  /** El título (o el texto entero de una nota). */
  title: string;
  /** Fecha, etiquetas, categoría, importe y enlace reconocidos. */
  extras: CaptureExtra[];
  /** Aviso discreto (prefijo que no es una lista, lista que falta…); vacío si no hay. */
  notice: string;
  /** La captura no se puede guardar tal cual. */
  incomplete: boolean;
}

/** Contexto extra con el que se afinan los avisos: el texto escrito y los prefijos que existen. */
export interface PreviewContext {
  text: string;
  prefixes: readonly PrefixOption[];
}

/** «2026-11-04» → «4 nov». */
export function friendlyDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return DAY.format(new Date(year, month - 1, day)).replace(/\./g, '');
}

/** Aviso de un prefijo que parece de una lista pero no lo es: con la corrección más probable si la hay. */
function unknownPrefixNotice(raw: string, prefixes: readonly PrefixOption[]): string {
  const close = closestPrefix(raw, prefixes);
  return close
    ? `«${raw}:» no es una lista. ¿Querías «${close.prefix}:»? Se guardará como nota.`
    : `No hay ninguna lista con el prefijo «${raw}:». Se guardará como nota, con el texto entero.`;
}

/** Con `no_title` el parser no dice la lista; se resuelve el prefijo a mano para poder nombrarla. */
function emptyTitleTarget(
  context: PreviewContext | undefined,
  lists: readonly List[] | null,
): { destination: string; listSlug?: string; prefix: string } | null {
  const raw = context ? listLikePrefix(context.text) : null;
  if (!raw) return null;
  const typed = normalize(raw);
  const known = context!.prefixes.find((option) => normalize(option.prefix) === typed);
  if (!known) return null;
  // «hoy:» y «mañana:» van a la lista con el alias de las tareas.
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
      // Con las listas cargadas y sin una con ese alias, el servidor lo guarda como nota (p. ej. `hoy:` sin lista de tareas).
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
