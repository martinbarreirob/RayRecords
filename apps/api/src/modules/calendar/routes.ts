import { CalendarEntrySchema, DateOnlySchema, addDays } from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import { toItem } from '../items/mapper';

const MAX_RANGE_DAYS = 400;

export const calendarRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  /**
   * Elementos con fecha (`dueDate`) entre `from` y `to`, ambas incluidas, de las listas no archivadas.
   * Ordenados por fecha y hora; los elementos sin hora van antes que los de ese día con hora.
   */
  app.get(
    '/calendar',
    {
      schema: {
        querystring: z.object({ from: DateOnlySchema, to: DateOnlySchema }),
        response: { 200: z.array(CalendarEntrySchema) },
      },
    },
    async (request) => {
      const { from, to } = request.query;
      if (to < from)
        throw new ApiError(400, 'validation_error', '«to» no puede ser anterior a «from»');
      if (addDays(from, MAX_RANGE_DAYS) < to) {
        throw new ApiError(400, 'validation_error', `El rango máximo es de ${MAX_RANGE_DAYS} días`);
      }

      const lists = await c.lists.find({ archived: false }).toArray();
      const byId = new Map(lists.map((list) => [list._id.toHexString(), list]));
      const docs = await c.items
        .find({ dueDate: { $gte: from, $lte: to }, listId: { $in: lists.map((l) => l._id) } })
        .sort({ dueDate: 1, time: 1, order: 1 })
        .toArray();

      return docs.map((doc) => {
        const list = byId.get(doc.listId.toHexString())!;
        return { ...toItem(doc), listName: list.name, listSlug: list.slug };
      });
    },
  );
};
