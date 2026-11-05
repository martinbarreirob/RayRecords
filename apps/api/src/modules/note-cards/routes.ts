import {
  CreateNoteCardSchema,
  CreateNoteGroupSchema,
  MoveNoteCardsSchema,
  NoteBoardSchema,
  NoteCardSchema,
  NoteGroupSchema,
  ObjectIdString,
  UpdateNoteCardSchema,
  UpdateNoteGroupSchema,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toNoteCard, toNoteGroup } from './mapper';
import {
  createCard,
  createGroup,
  deleteCard,
  dissolveGroup,
  listBoard,
  listDone,
  moveCards,
  updateCard,
  updateGroup,
} from './service';

const IdParams = z.object({ id: ObjectIdString });

/** Notas como tarjetas en un lienzo, con grupos. Ver docs/ARCHITECTURE.md. */
export const noteCardsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  app.get('/note-cards', { schema: { response: { 200: NoteBoardSchema } } }, async () => {
    const { cards, groups } = await listBoard(c);
    return { cards: cards.map(toNoteCard), groups: groups.map(toNoteGroup) };
  });

  /** Hechas hace más de 24 h (ocultas del lienzo). */
  app.get(
    '/note-cards/done',
    { schema: { response: { 200: z.array(NoteCardSchema) } } },
    async () => (await listDone(c)).map(toNoteCard),
  );

  app.post(
    '/note-cards',
    { schema: { body: CreateNoteCardSchema, response: { 201: NoteCardSchema } } },
    async (request, reply) => reply.status(201).send(toNoteCard(await createCard(c, request.body))),
  );

  app.patch(
    '/note-cards',
    { schema: { body: MoveNoteCardsSchema, response: { 200: z.array(NoteCardSchema) } } },
    async (request) => (await moveCards(c, request.body)).map(toNoteCard),
  );

  app.patch(
    '/note-cards/:id',
    {
      schema: { params: IdParams, body: UpdateNoteCardSchema, response: { 200: NoteCardSchema } },
    },
    async (request) => toNoteCard(await updateCard(c, request.params.id, request.body)),
  );

  app.delete(
    '/note-cards/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteCard(c, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/note-groups',
    { schema: { body: CreateNoteGroupSchema, response: { 201: NoteGroupSchema } } },
    async (request, reply) =>
      reply.status(201).send(toNoteGroup(await createGroup(c, request.body))),
  );

  app.patch(
    '/note-groups/:id',
    {
      schema: { params: IdParams, body: UpdateNoteGroupSchema, response: { 200: NoteGroupSchema } },
    },
    async (request) => toNoteGroup(await updateGroup(c, request.params.id, request.body)),
  );

  /** Disuelve el grupo: sus tarjetas quedan sueltas y se devuelven ya liberadas. */
  app.delete(
    '/note-groups/:id',
    { schema: { params: IdParams, response: { 200: z.array(NoteCardSchema) } } },
    async (request) => (await dissolveGroup(c, request.params.id)).map(toNoteCard),
  );
};
