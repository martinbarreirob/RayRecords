import {
  CreateItemSchema,
  ItemSchema,
  MoveItemSchema,
  ObjectIdString,
  UpdateItemSchema,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId, type Filter } from 'mongodb';
import { z } from 'zod';
import type { ItemDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { toItem } from './mapper';
import { orderBetween, renumber } from './ordering';
import { assertValidExtra, createItem, groupFilter, nextOrder, resolveColumn } from './service';

const IdParams = z.object({ id: ObjectIdString });

export const itemsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  async function loadItem(id: string) {
    const item = await c.items.findOne({ _id: new ObjectId(id) });
    if (!item) throw new ApiError(404, 'not_found', 'El elemento no existe');
    const list = await c.lists.findOne({ _id: item.listId });
    if (!list) throw new ApiError(404, 'not_found', 'La lista del elemento no existe');
    return { item, list };
  }

  app.get(
    '/lists/:id/items',
    {
      schema: {
        params: IdParams,
        querystring: z.object({
          tag: z.string().trim().toLowerCase().min(1).optional(),
          q: z.string().trim().min(1).max(100).optional(),
          done: z.enum(['true', 'false']).optional(),
        }),
        response: { 200: z.array(ItemSchema) },
      },
    },
    async (request) => {
      const listId = new ObjectId(request.params.id);
      const { tag, q, done } = request.query;
      const filter: Filter<ItemDoc> = { listId };
      if (tag) filter.tags = tag;
      if (q) filter.$text = { $search: q };
      if (done) filter.doneAt = { $exists: done === 'true' };
      const docs = await c.items.find(filter).sort({ order: 1 }).toArray();
      return docs.map(toItem);
    },
  );

  app.post(
    '/items',
    { schema: { body: CreateItemSchema, response: { 201: ItemSchema } } },
    async (request, reply) => {
      const { listId, ...input } = request.body;
      const list = await c.lists.findOne({ _id: new ObjectId(listId) });
      if (!list || list.archived) throw new ApiError(404, 'not_found', 'La lista no existe');
      return reply.status(201).send(toItem(await createItem(c, list, input)));
    },
  );

  app.patch(
    '/items/:id',
    {
      schema: { params: IdParams, body: UpdateItemSchema, response: { 200: ItemSchema } },
    },
    async (request) => {
      const { item, list } = await loadItem(request.params.id);
      const { done, extra, column, tags, text, dueDate, time, url, title } = request.body;

      const $set: Record<string, unknown> = { updatedAt: new Date() };
      const $unset: Record<string, ''> = {};
      const apply = (key: string, value: unknown) => {
        if (value === null) $unset[key] = '';
        else if (value !== undefined) $set[key] = value;
      };

      if (title !== undefined) $set.title = title;
      if (tags !== undefined) $set.tags = [...new Set(tags)];
      apply('text', text);
      apply('dueDate', dueDate);
      apply('time', time);
      apply('url', url);

      if (extra) {
        assertValidExtra(list, extra);
        // Mezcla por clave (las claves de `extra` solo admiten [a-z][A-Za-z0-9_]): `null` borra.
        for (const [key, value] of Object.entries(extra)) apply(`extra.${key}`, value);
      }

      if (done === true && !item.doneAt) $set.doneAt = new Date();
      if (done === false) $unset.doneAt = '';

      if (column !== undefined && column !== item.column) {
        const target = resolveColumn(list, column);
        $set.column = target;
        $set.order = await nextOrder(c, item.listId, target);
      }

      const doc = await c.items.findOneAndUpdate(
        { _id: item._id },
        { $set, ...(Object.keys($unset).length > 0 && { $unset }) },
        { returnDocument: 'after' },
      );
      return toItem(doc!);
    },
  );

  app.post(
    '/items/:id/move',
    { schema: { params: IdParams, body: MoveItemSchema, response: { 200: ItemSchema } } },
    async (request) => {
      const { item, list } = await loadItem(request.params.id);
      const column = resolveColumn(list, request.body.column ?? item.column);
      const { afterId } = request.body;

      const siblings = () =>
        c.items
          .find({ ...groupFilter(item.listId, column), _id: { $ne: item._id } })
          .sort({ order: 1 })
          .project<{ _id: ObjectId; order: number }>({ order: 1 })
          .toArray();

      const position = (group: { _id: ObjectId; order: number }[]) => {
        if (afterId === null) return { prev: undefined, next: group[0]?.order };
        const index = group.findIndex((s) => s._id.toHexString() === afterId);
        if (index === -1) {
          throw new ApiError(
            400,
            'validation_error',
            'El elemento de referencia no está en esa columna',
          );
        }
        return { prev: group[index]!.order, next: group[index + 1]?.order };
      };

      let group = await siblings();
      let { prev, next } = position(group);
      let order = orderBetween(prev, next);
      if (order === null) {
        // Sin hueco entre vecinos: se renumera la columna entera y se recalcula.
        const orders = renumber(group.length);
        await c.items.bulkWrite(
          group.map((s, i) => ({
            updateOne: { filter: { _id: s._id }, update: { $set: { order: orders[i]! } } },
          })),
        );
        group = await siblings();
        ({ prev, next } = position(group));
        order = orderBetween(prev, next)!;
      }

      const doc = await c.items.findOneAndUpdate(
        { _id: item._id },
        { $set: { order, updatedAt: new Date(), ...(column !== undefined && { column }) } },
        { returnDocument: 'after' },
      );
      return toItem(doc!);
    },
  );

  app.delete(
    '/items/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const { deletedCount } = await c.items.deleteOne({ _id: new ObjectId(request.params.id) });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'El elemento no existe');
      return reply.status(204).send(null);
    },
  );
};
