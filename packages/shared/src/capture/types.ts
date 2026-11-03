import type { DateOnly } from '../dates';

/** Un elemento para una lista, resuelto por su alias de captura (`peli`, `compra`, `tarea`…). */
export interface CaptureItem {
  kind: 'item';
  /** Alias de la lista destino, tal y como se registró; la API lo resuelve a `lists.captureAlias`. */
  list: string;
  title: string;
  tags: string[];
  category?: string;
  priceCents?: number;
  url?: string;
  dueDate?: DateOnly;
}

/** Texto libre para la nota del día. Es el destino por defecto: capturar nunca falla. */
export interface CaptureDailyNote {
  kind: 'daily_note';
  date: DateOnly;
  text: string;
  reason: 'no_prefix' | 'unknown_prefix';
}

/** No hay nada que guardar (entrada en blanco o prefijo sin contenido). */
export interface CaptureEmpty {
  kind: 'empty';
  reason: 'blank' | 'no_title';
}

export type CaptureResult = CaptureItem | CaptureDailyNote | CaptureEmpty;

export interface ParseOptions {
  /** Alias de lista reconocidos (los `captureAlias` de las listas). Por defecto, los de los presets. */
  aliases?: readonly string[];
  /** Instante de referencia para `hoy` / `mañana`. Inyectable para tests. */
  now?: Date;
  timeZone?: string;
}
