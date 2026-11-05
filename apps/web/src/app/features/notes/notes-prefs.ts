/** Preferencias de la pantalla de notas que se recuerdan en el navegador. Nunca fallan si no hay almacenamiento. */

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

/** ¿Se muestra la barra de atajos? Por defecto sí; solo un «0» guardado la oculta. */
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
    // Sin almacenamiento (modo privado, cuota): la preferencia vale solo para esta sesión.
  }
}

/**
 * ¿Está bloqueada la disposición (no se pueden mover las notas)? Por defecto sí: solo un «0» guardado,
 * es decir, haberla desbloqueado a propósito, la deja libre.
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
    // Sin almacenamiento: la preferencia vale solo para esta sesión.
  }
}
