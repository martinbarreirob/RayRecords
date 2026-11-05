import type { DateOnly } from '../dates';

/** An item for a list, resolved by its capture alias (`peli`, `compra`, `tarea`...). */
export interface CaptureItem {
  kind: 'item';
  /** Alias of the target list as registered; the API resolves it to `lists.captureAlias`. */
  list: string;
  title: string;
  tags: string[];
  category?: string;
  priceCents?: number;
  url?: string;
  dueDate?: DateOnly;
}

/** Free text for the daily note. This is the default target: capturing never fails. */
export interface CaptureDailyNote {
  kind: 'daily_note';
  date: DateOnly;
  text: string;
  reason: 'no_prefix' | 'unknown_prefix';
}

/** Nothing to save (blank input or a prefix with no content). */
export interface CaptureEmpty {
  kind: 'empty';
  reason: 'blank' | 'no_title';
}

export type CaptureResult = CaptureItem | CaptureDailyNote | CaptureEmpty;

export interface ParseOptions {
  /** Recognized list aliases (the lists' `captureAlias`). Defaults to the preset ones. */
  aliases?: readonly string[];
  /** Reference instant for `hoy` / `mañana`. Injectable for tests. */
  now?: Date;
  timeZone?: string;
}
