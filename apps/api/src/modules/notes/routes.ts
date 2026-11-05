import {
  AppendNoteSchema,
  DateOnlySchema,
  MonthSchema,
  NoteViewSchema,
  UpsertDailyNoteSchema,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendToNote, getNote, putNote } from './service';

const DateParams = z.object({ date: DateOnlySchema });

export const notesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  /** Dates of a month that have a note, for navigating between days. */
  app.get(
    '/notes',
    {
      schema: {
        querystring: z.object({ month: MonthSchema }),
        response: { 200: z.array(DateOnlySchema) },
      },
    },
    async (request) => {
      const { month } = request.query;
      const docs = await c.dailyNotes
        .find({ date: { $regex: `^${month}-` }, content: { $ne: '' } })
        .project<{ date: string }>({ date: 1 })
        .sort({ date: 1 })
        .toArray();
      return docs.map((doc) => doc.date);
    },
  );

  app.get(
    '/notes/:date',
    { schema: { params: DateParams, response: { 200: NoteViewSchema } } },
    async (request) => getNote(c, request.params.date),
  );

  app.put(
    '/notes/:date',
    {
      schema: {
        params: DateParams,
        body: UpsertDailyNoteSchema,
        response: { 200: NoteViewSchema },
      },
    },
    async (request) => putNote(c, request.params.date, request.body.content),
  );

  app.post(
    '/notes/:date/append',
    {
      schema: { params: DateParams, body: AppendNoteSchema, response: { 200: NoteViewSchema } },
    },
    async (request) => (await appendToNote(c, request.params.date, request.body.text)).note,
  );
};
