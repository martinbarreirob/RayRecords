import type { CreateItem, Extra } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { Collections } from '../../db/client';
import type { ItemDoc, ListDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { validateExtra } from './extra';
import { ORDER_STEP } from './ordering';

/** Filtro de "la columna" de un elemento: el tablero la usa; en listas sin tablero no hay columna. */
export function groupFilter(listId: ObjectId, column: string | undefined) {
  return { listId, column: column === undefined ? { $exists: false } : column };
}

export function assertValidExtra(list: ListDoc, extra: Extra): void {
  const issues = validateExtra(list.fieldDefs, extra);
  if (issues.length) throw new ApiError(400, 'validation_error', 'Datos inválidos', issues);
}

/** Columna a usar: la indicada (validada contra el tablero) o, por defecto, la primera. */
export function resolveColumn(list: ListDoc, requested: string | undefined): string | undefined {
  if (!list.board) {
    if (requested) throw new ApiError(400, 'validation_error', 'La lista no es un tablero');
    return undefined;
  }
  const column = requested ?? list.board.columns[0]!.key;
  if (!list.board.columns.some((col) => col.key === column)) {
    throw new ApiError(400, 'validation_error', `La columna «${column}» no existe en el tablero`);
  }
  return column;
}

export async function nextOrder(c: Collections, listId: ObjectId, column: string | undefined) {
  const last = await c.items
    .find(groupFilter(listId, column))
    .sort({ order: -1 })
    .limit(1)
    .project<{ order: number }>({ order: 1 })
    .next();
  return (last?.order ?? 0) + ORDER_STEP;
}

/** Crea un elemento ya validado en su lista. Lo usan `POST /items` y la captura rápida. */
export async function createItem(
  c: Collections,
  list: ListDoc,
  input: Omit<CreateItem, 'listId'>,
  now = new Date(),
): Promise<ItemDoc> {
  assertValidExtra(list, input.extra);
  const column = resolveColumn(list, input.column);
  const doc: ItemDoc = {
    _id: new ObjectId(),
    listId: list._id,
    title: input.title,
    ...(input.text !== undefined && { text: input.text }),
    tags: [...new Set(input.tags)],
    ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
    ...(input.time !== undefined && { time: input.time }),
    ...(input.url !== undefined && { url: input.url }),
    extra: input.extra,
    ...(column !== undefined && { column }),
    order: await nextOrder(c, list._id, column),
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
  await c.items.insertOne(doc);
  return doc;
}
