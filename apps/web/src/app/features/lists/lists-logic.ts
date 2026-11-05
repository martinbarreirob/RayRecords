/** Misma regla que `CaptureAlias` de shared (copiada aquí para no arrastrar Zod a la web). */
const ALIAS = /^[a-z][a-z0-9]{1,19}$/;

/** Lo escrito en el campo de alias → minúsculas y sin espacios (`Peli ` → `peli`). */
export function cleanAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/** Motivo por el que un alias de captura no vale (vacío es válido: la lista no tiene alias). */
export function aliasError(alias: string): string | null {
  if (alias === '' || ALIAS.test(alias)) return null;
  if (!/^[a-z]/.test(alias)) return 'Debe empezar por una letra';
  if (alias.length < 2) return 'Necesita al menos 2 caracteres';
  if (alias.length > 20) return 'Máximo 20 caracteres';
  return 'Solo letras sin tilde y números, sin espacios';
}

/**
 * Orden de las listas. Misma idea que el Kanban (`apps/api/src/modules/items/ordering.ts`, copiada
 * aquí para no depender de la API): la lista que se mueve toma el punto medio entre sus nuevos
 * vecinos y solo se renumera todo cuando el hueco se agota.
 */

/** Separación entre listas al renumerar y al poner una lista en un extremo. */
export const ORDER_STEP = 1000;
/** Por debajo de este hueco entre vecinos ya no se puede subdividir con fiabilidad. */
const MIN_GAP = 1e-3;

/** Lo mínimo que hace falta de una lista para ordenarla. */
export interface Orderable {
  id: string;
  order: number;
}

/**
 * Orden para colocar algo entre `prev` y `next` (vecinos ya ordenados; `undefined` = extremo).
 * Devuelve `null` si no queda hueco suficiente y hay que renumerar.
 */
export function orderBetween(prev: number | undefined, next: number | undefined): number | null {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return next! - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  if (next - prev < MIN_GAP * 2) return null;
  return (prev + next) / 2;
}

/** Órdenes nuevos y equiespaciados para `count` listas (renumeración). */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * ORDER_STEP);
}

/** Resultado de mover una lista: cómo queda el conjunto y qué `order` hay que guardar en la API. */
export interface ReorderPlan<T extends Orderable> {
  /** Las listas ya en su nuevo orden, con el `order` actualizado. */
  lists: T[];
  /** Cambios de `order` a enviar: uno solo normalmente; varios si hubo que renumerar. */
  patches: { id: string; order: number }[];
}

/**
 * Mueve la lista `id` a la posición `toIndex` (la que tendrá al terminar, contada de 0; se acota al
 * rango). `lists` debe venir ordenado por `order`. `null` si la lista no existe o no cambia de sitio.
 */
export function planReorder<T extends Orderable>(
  lists: readonly T[],
  id: string,
  toIndex: number,
): ReorderPlan<T> | null {
  const from = lists.findIndex((l) => l.id === id);
  if (from === -1) return null;
  const to = Math.max(0, Math.min(Math.trunc(toIndex), lists.length - 1));
  if (to === from) return null;

  const moved = lists[from]!;
  const rest = lists.filter((l) => l.id !== id);
  const order = orderBetween(rest[to - 1]?.order, rest[to]?.order);

  if (order !== null) {
    const next = [...rest.slice(0, to), { ...moved, order }, ...rest.slice(to)];
    return { lists: next, patches: [{ id, order }] };
  }

  // Sin hueco: se renumeran todas y solo se envían las que de verdad cambian.
  const sequence = [...rest.slice(0, to), moved, ...rest.slice(to)];
  const orders = renumber(sequence.length);
  const next = sequence.map((l, i) => ({ ...l, order: orders[i]! }));
  const before = new Map(lists.map((l) => [l.id, l.order]));
  const patches = next
    .filter((l) => before.get(l.id) !== l.order)
    .map((l) => ({ id: l.id, order: l.order }));
  return { lists: next, patches };
}

/** Posición final al subir (-1) o bajar (+1) una lista un puesto; `null` si ya está en el extremo. */
export function stepIndex(
  lists: readonly Orderable[],
  id: string,
  direction: -1 | 1,
): number | null {
  const index = lists.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const target = index + direction;
  return target < 0 || target >= lists.length ? null : target;
}

/** Copia de las listas ordenada por `order` (estable: las que empatan conservan su sitio). */
export function sortByOrder<T extends Orderable>(lists: readonly T[]): T[] {
  return [...lists].sort((a, b) => a.order - b.order);
}

/** Aviso para lectores de pantalla tras mover una lista: «Películas movida a la posición 2 de 6». */
export function movedMessage(name: string, index: number, total: number): string {
  return `${name} movida a la posición ${index + 1} de ${total}`;
}
