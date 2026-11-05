import {
  CreateEventSchema,
  EventSchema,
  ObjectIdString,
  UpdateEventSchema,
  type CalendarEvent,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { EventDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';

const IdParams = z.object({ id: ObjectIdString });

export function toEvent(doc: EventDoc): CalendarEvent {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    date: doc.date,
    ...(doc.time !== undefined && { time: doc.time }),
    ...(doc.doneAt !== undefined && { doneAt: doc.doneAt.toISOString() }),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Events that belong to the calendar only, not to any list. */
export const eventsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  app.post(
    '/events',
    { schema: { body: CreateEventSchema, response: { 201: EventSchema } } },
    async (request, reply) => {
      const now = new Date();
      const doc: EventDoc = {
        _id: new ObjectId(),
        ...request.body,
        createdAt: now,
        updatedAt: now,
      };
      await c.events.insertOne(doc);
      return reply.status(201).send(toEvent(doc));
    },
  );

  app.patch(
    '/events/:id',
    { schema: { params: IdParams, body: UpdateEventSchema, response: { 200: EventSchema } } },
    async (request) => {
      const { title, date, time, done } = request.body;
      const $set: Record<string, unknown> = { updatedAt: new Date() };
      const $unset: Record<string, ''> = {};

      if (title !== undefined) $set.title = title;
      if (date !== undefined) $set.date = date;
      if (time === null) $unset.time = '';
      else if (time !== undefined) $set.time = time;
      if (done === true) $set.doneAt = new Date();
      if (done === false) $unset.doneAt = '';

      const doc = await c.events.findOneAndUpdate(
        { _id: new ObjectId(request.params.id) },
        { $set, ...(Object.keys($unset).length > 0 && { $unset }) },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'El evento no existe');
      return toEvent(doc);
    },
  );

  app.delete(
    '/events/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const { deletedCount } = await c.events.deleteOne({ _id: new ObjectId(request.params.id) });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'El evento no existe');
      return reply.status(204).send(null);
    },
  );
};
