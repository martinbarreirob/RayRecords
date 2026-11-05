import {
  AccountSummarySchema,
  CreateAccountSchema,
  ObjectIdString,
  UpdateAccountSchema,
  type AccountSummary,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AccountDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';

const IdParams = z.object({ id: ObjectIdString });

function toAccount(doc: AccountDoc) {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    ...(doc.bank !== undefined && { bank: doc.bank }),
    type: doc.type,
    currency: doc.currency,
    openingBalanceCents: doc.openingBalanceCents,
    openingDate: doc.openingDate,
    archived: doc.archived,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const accountsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  /** El saldo no se guarda: apertura + suma de los movimientos de la cuenta. */
  async function summarize(docs: AccountDoc[]): Promise<AccountSummary[]> {
    const sums = await c.transactions
      .aggregate<{ _id: ObjectId; sum: number; count: number }>([
        { $match: { accountId: { $in: docs.map((d) => d._id) } } },
        { $group: { _id: '$accountId', sum: { $sum: '$amountCents' }, count: { $sum: 1 } } },
      ])
      .toArray();
    const byId = new Map(sums.map((s) => [s._id.toHexString(), s]));
    return docs.map((doc) => {
      const found = byId.get(doc._id.toHexString());
      return {
        ...toAccount(doc),
        balanceCents: doc.openingBalanceCents + (found?.sum ?? 0),
        transactionCount: found?.count ?? 0,
      };
    });
  }

  app.get(
    '/accounts',
    {
      schema: {
        querystring: z.object({ archived: z.enum(['true', 'false']).default('false') }),
        response: { 200: z.array(AccountSummarySchema) },
      },
    },
    async (request) => {
      const docs = await c.accounts
        .find({ archived: request.query.archived === 'true' })
        .sort({ name: 1 })
        .toArray();
      return summarize(docs);
    },
  );

  app.post(
    '/accounts',
    { schema: { body: CreateAccountSchema, response: { 201: AccountSummarySchema } } },
    async (request, reply) => {
      const doc: AccountDoc = {
        _id: new ObjectId(),
        ...request.body,
        archived: false,
        createdAt: new Date(),
      };
      await c.accounts.insertOne(doc);
      return reply.status(201).send((await summarize([doc]))[0]!);
    },
  );

  app.patch(
    '/accounts/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateAccountSchema,
        response: { 200: AccountSummarySchema },
      },
    },
    async (request) => {
      const doc = await c.accounts.findOneAndUpdate(
        { _id: new ObjectId(request.params.id) },
        { $set: request.body },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'La cuenta no existe');
      return (await summarize([doc]))[0]!;
    },
  );
};
