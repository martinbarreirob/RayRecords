import type { Item } from '@rayrecords/shared';

/** Priority of a card, stored in `extra.priority`; no value means no priority. */
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

/** How many of the four bars are filled: 1 for low up to 4 for urgent. */
export function priorityLevel(priority: Priority): number {
  return PRIORITIES.indexOf(priority) + 1;
}

/** The old «prioridad» select of the Kanban preset, read as a priority until it is edited. */
const LEGACY: Record<string, Priority> = { baja: 'low', media: 'medium', alta: 'high' };
export const LEGACY_PRIORITY_KEY = 'prioridad';

export function priorityOf(item: Pick<Item, 'extra'>): Priority | null {
  const value = item.extra['priority'];
  const own = PRIORITIES.find((priority) => priority === value);
  if (own) return own;
  const legacy = item.extra[LEGACY_PRIORITY_KEY];
  return typeof legacy === 'string' ? (LEGACY[legacy] ?? null) : null;
}
