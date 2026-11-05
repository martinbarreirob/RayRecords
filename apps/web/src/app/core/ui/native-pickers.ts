/**
 * `true` on touch or no-cursor devices: there the system's native date and time picker is the most
 * comfortable and is used instead of the desktop one. `matchMedia` does not exist in jsdom, hence the `?.`.
 */
export function prefersNativePickers(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return !!(matchMedia('(pointer: coarse)')?.matches || matchMedia('(hover: none)')?.matches);
}
