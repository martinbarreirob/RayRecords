/**
 * `true` en dispositivos táctiles o sin cursor: ahí el selector nativo de fecha y hora del sistema es
 * lo más cómodo, y se usa en lugar del de escritorio. `matchMedia` no existe en jsdom: de ahí el `?.`.
 */
export function prefersNativePickers(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return !!(matchMedia('(pointer: coarse)')?.matches || matchMedia('(hover: none)')?.matches);
}
