import {
  CreateListSchema,
  ListSchema,
  ObjectIdString,
  UpdateListSchema,
  slugify,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Collections } from '../../db/client';
import type { ListDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { isDuplicateKey } from '../../http/mongo';
import { ORDER_STEP } from '../items/ordering';
import { toList } from './mapper';

const IdParams = z.object({ id: ObjectIdString });

/** Slug único a partir del nombre: `peliculas`, `peliculas-2`… */
async function uniqueSlug(c: Collections, name: string): Promise<string> {
  const base = slugify(name) || 'lista';
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await c.lists.findOne({ slug }, { projection: { _id: 1 } }))) return slug;
  }
}

/** Traduce la violación del índice único de alias en un 409 con el nombre de la lista que lo usa. */
async function aliasConflict(c: Collections, alias: string | undefined): Promise<ApiError> {
  const owner = alias ? await c.lists.findOne({ captureAlias: alias }) : null;
  return new ApiError(
    409,
    'alias_in_use',
    owner
      ? `El alias «${alias}» ya lo usa la lista «${owner.name}»`
      : `El alias «${alias}» ya está en uso`,
  );
}

export const listsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  app.get(
    '/lists',
    {
      schema: {
        querystring: z.object({ archived: z.enum(['true', 'false']).default('false') }),
        response: { 200: z.array(ListSchema) },
      },
    },
    async (request) => {
      const docs = await c.lists
        .find({ archived: request.query.archived === 'true' })
        .sort({ order: 1 })
        .toArray();
      return docs.map(toList);
    },
  );

  app.post(
    '/lists',
    { schema: { body: CreateListSchema, response: { 201: ListSchema } } },
    async (request, reply) => {
      const body = request.body;
      const keys = body.fieldDefs.map((f) => f.key);
      if (new Set(keys).size !== keys.length) {
        throw new ApiError(400, 'validation_error', 'Hay campos con la clave repetida');
      }

      const last = await c.lists.find({}).sort({ order: -1 }).limit(1).next();
      const now = new Date();
      const doc: ListDoc = {
        _id: new ObjectId(),
        name: body.name,
        slug: await uniqueSlug(c, body.name),
        kind: body.kind,
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.captureAlias !== undefined && { captureAlias: body.captureAlias }),
        fieldDefs: body.fieldDefs,
        ...(body.board !== undefined && { board: body.board }),
        order: (last?.order ?? 0) + ORDER_STEP,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await c.lists.insertOne(doc);
      } catch (error) {
        if (isDuplicateKey(error, 'captureAlias')) throw await aliasConflict(c, body.captureAlias);
        throw error;
      }
      return reply.status(201).send(toList(doc));
    },
  );

  app.patch(
    '/lists/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateListSchema,
        response: { 200: ListSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { captureAlias, fieldDefs, ...rest } = request.body;

      if (fieldDefs) {
        const keys = fieldDefs.map((f) => f.key);
        if (new Set(keys).size !== keys.length) {
          throw new ApiError(400, 'validation_error', 'Hay campos con la clave repetida');
        }
      }

      const $set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (fieldDefs) $set.fieldDefs = fieldDefs;
      if (typeof captureAlias === 'string') $set.captureAlias = captureAlias;
      const update = {
        $set,
        ...(captureAlias === null && { $unset: { captureAlias: '' as const } }),
      };

      let doc: ListDoc | null;
      try {
        doc = await c.lists.findOneAndUpdate({ _id: new ObjectId(id) }, update, {
          returnDocument: 'after',
        });
      } catch (error) {
        if (isDuplicateKey(error, 'captureAlias'))
          throw await aliasConflict(c, captureAlias ?? undefined);
        throw error;
      }
      if (!doc) throw new ApiError(404, 'not_found', 'La lista no existe');
      return toList(doc);
    },
  );
};
