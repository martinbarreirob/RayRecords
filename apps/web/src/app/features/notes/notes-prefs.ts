/** Notes screen preferences remembered in the browser. They never fail when there is no storage. */

export const HINTS_KEY = 'rayrecords.notes.hints';
export const LOCK_KEY = 'rayrecords.notes.locked';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Is the shortcut bar shown? Yes by default; only a stored «0» hides it. */
export function readHintsOpen(store: Store | null = defaultStore()): boolean {
  try {
    return store?.getItem(HINTS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeHintsOpen(open: boolean, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(HINTS_KEY, open ? '1' : '0');
  } catch {
    // No storage (private mode, quota): the preference only holds for this session.
  }
}

/**
 * Is the layout locked (notes cannot be moved)? Yes by default: only a stored «0», that is, having
 * unlocked it on purpose, leaves it free.
 */
export function readLayoutLocked(store: Store | null = defaultStore()): boolean {
  try {
    return store?.getItem(LOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeLayoutLocked(locked: boolean, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(LOCK_KEY, locked ? '1' : '0');
  } catch {
    // No storage: the preference only holds for this session.
  }
}
