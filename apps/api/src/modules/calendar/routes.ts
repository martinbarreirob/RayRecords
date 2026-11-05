import {
  CalendarEntrySchema,
  DateOnlySchema,
  addDays,
  type CalendarEntry,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ListDoc } from '../../db/documents';

const MAX_RANGE_DAYS = 400;

/** Plain string order (ISO dates and times), independent of the runtime locale. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One calendar entry: a dated list item (with its list) or an event of its own. */
function entry(
  kind: CalendarEntry['kind'],
  id: string,
  title: string,
  dueDate: string,
  time: string | undefined,
  doneAt: Date | undefined,
  list?: ListDoc,
): CalendarEntry {
  return {
    kind,
    id,
    title,
    dueDate,
    ...(time !== undefined && { time }),
    ...(doneAt !== undefined && { doneAt: doneAt.toISOString() }),
    ...(list && { listName: list.name, listSlug: list.slug }),
  };
}

export const calendarRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  /**
   * Items with a `dueDate` between `from` and `to` (both inclusive) from non-archived lists, plus
   * the calendar's own events. Sorted by date and time; entries without a time come first.
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

      const [lists, events] = await Promise.all([
        c.lists.find({ archived: false }).toArray(),
        c.events
          .find({ date: { $gte: from, $lte: to } })
          .sort({ date: 1, time: 1, createdAt: 1 })
          .toArray(),
      ]);
      const byId = new Map(lists.map((list) => [list._id.toHexString(), list]));
      const docs = await c.items
        .find({ dueDate: { $gte: from, $lte: to }, listId: { $in: lists.map((l) => l._id) } })
        .sort({ dueDate: 1, time: 1, order: 1 })
        .toArray();

      const entries: CalendarEntry[] = [
        ...docs.map((doc) =>
          entry(
            'item',
            doc._id.toHexString(),
            doc.title,
            doc.dueDate!,
            doc.time,
            doc.doneAt,
            byId.get(doc.listId.toHexString()),
          ),
        ),
        ...events.map((doc) =>
          entry('event', doc._id.toHexString(), doc.title, doc.date, doc.time, doc.doneAt),
        ),
      ];

      // Same order as before: by date, then time (no time first). Array.sort is stable, so items
      // keep their list order and events their creation order within the same slot.
      return entries.sort(
        (a, b) => compare(a.dueDate, b.dueDate) || compare(a.time ?? '', b.time ?? ''),
      );
    },
  );
};
