import { Injectable, signal } from '@angular/core';
import { CATEGORY_ICONS, HEX_COLOR_RE, type CategoryIcon } from '@rayrecords/shared';
import { of } from 'rxjs';
import type { CategoryOps, ManagedCategory } from './categories-dialog';

/** The look of "Todas": a category look whose icon is one the manager offers. */
export interface AllLook {
  icon: CategoryIcon;
  color: string;
  iconColor: string;
}

/** Id and name of the built-in "Todas" category: it shows everything and is not stored in the API. */
export const ALL_CATEGORY_ID = 'all';
export const ALL_CATEGORY_NAME = 'Todas';

export const ALL_CATEGORY_KEY = 'rayrecords.all-category';

/** White chip with a box: the icon is dark so it can be seen on the white square. */
export const DEFAULT_ALL_LOOK: AllLook = {
  icon: 'box',
  color: '#ffffff',
  iconColor: '#2b2b2b',
};

/** A saved look read back as it is: anything unexpected falls to the default of its field. */
export function parseAllLook(raw: string | null): AllLook {
  if (!raw) return DEFAULT_ALL_LOOK;
  try {
    const value = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const icon = CATEGORY_ICONS.find((name) => name === value['icon']);
    const hex = (field: unknown, fallback: string) =>
      typeof field === 'string' && HEX_COLOR_RE.test(field) ? field.toLowerCase() : fallback;
    return {
      icon: icon ?? DEFAULT_ALL_LOOK.icon,
      color: hex(value['color'], DEFAULT_ALL_LOOK.color),
      iconColor: hex(value['iconColor'], DEFAULT_ALL_LOOK.iconColor),
    };
  } catch {
    return DEFAULT_ALL_LOOK;
  }
}

/** "Todas" as the category manager lists it: fixed name, cannot be deleted. */
export function allCategoryEntry(look: AllLook): ManagedCategory {
  return { id: ALL_CATEGORY_ID, name: ALL_CATEGORY_NAME, locked: true, ...look };
}

/**
 * Sends the edits of "Todas" to the store and everything else to the host's own operations.
 * Its name never changes: only the icon and the colors are taken.
 */
export function withAllCategory(
  ops: CategoryOps,
  store: { save(look: AllLook): void; look(): AllLook },
): CategoryOps {
  return {
    create: (input) => ops.create(input),
    remove: (id) => (id === ALL_CATEGORY_ID ? of(undefined) : ops.remove(id)),
    update: (id, changes) => {
      if (id !== ALL_CATEGORY_ID) return ops.update(id, changes);
      const { icon, color, iconColor } = changes;
      const current = store.look();
      store.save({
        icon: icon ?? current.icon,
        color: color ?? current.color,
        iconColor: iconColor ?? current.iconColor,
      });
      return of(undefined);
    },
  };
}

/**
 * The look of "Todas". Like the printer settings it is kept in the browser: it is a personal
 * touch, not data, so it needs no collection in the API.
 */
@Injectable({ providedIn: 'root' })
export class AllCategoryStore {
  readonly look = signal<AllLook>(read());

  save(look: AllLook): void {
    this.look.set(look);
    try {
      localStorage.setItem(ALL_CATEGORY_KEY, JSON.stringify(look));
    } catch {
      // Blocked storage: the look lasts until the page is closed.
    }
  }
}

function read(): AllLook {
  try {
    return parseAllLook(localStorage.getItem(ALL_CATEGORY_KEY));
  } catch {
    return DEFAULT_ALL_LOOK;
  }
}
