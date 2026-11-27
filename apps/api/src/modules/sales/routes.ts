import {
  CreateTicketSchema,
  DEFAULT_TIME_ZONE,
  DateOnlySchema,
  ProductSalesSchema,
  TicketSchema,
  addDays,
  startOfDayIn,
  type Ticket,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { TicketDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { isDuplicateKey } from '../../http/mongo';

/** How many times a ticket retries when another sale takes its number first. */
const NUMBER_ATTEMPTS = 5;

function toTicket(doc: TicketDoc): Ticket {
  return {
    id: doc._id.toHexString(),
    number: doc.number,
    lines: doc.lines.map((line) => ({ ...line, productId: line.productId.toHexString() })),
    totalCents: doc.totalCents,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const salesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.data;

  /**
   * Newest first. `from` and `to` are calendar days in the app's time zone, both included; either
   * can be left out.
   */
  app.get(
    '/tickets',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          from: DateOnlySchema.optional(),
          to: DateOnlySchema.optional(),
        }),
        response: { 200: z.array(TicketSchema) },
      },
    },
    async (request) => {
      const { limit, from, to } = request.query;
      const createdAt = {
        ...(from && { $gte: startOfDayIn(from, DEFAULT_TIME_ZONE) }),
        ...(to && { $lt: startOfDayIn(addDays(to, 1), DEFAULT_TIME_ZONE) }),
      };
      const docs = await c.tickets
        .find(from || to ? { createdAt } : {})
        .sort({ number: -1 })
        .limit(limit)
        .toArray();
      return docs.map(toTicket);
    },
  );

  /**
   * Turns a cart into a ticket and takes the units out of the stock. Each product is decremented
   * only if it still has enough, so two sales cannot sell the same unit; if one line fails, the
   * ones already taken are put back (a standalone Mongo has no transactions).
   */
  app.post(
    '/tickets',
    { schema: { body: CreateTicketSchema, response: { 201: TicketSchema } } },
    async (request, reply) => {
      // The same product on two lines counts once, with the quantities added up.
      const wanted = new Map<string, number>();
      for (const { productId, quantity } of request.body.lines) {
        wanted.set(productId, (wanted.get(productId) ?? 0) + quantity);
      }
      const ids = [...wanted.keys()].map((id) => new ObjectId(id));
      const products = await c.products.find({ _id: { $in: ids } }).toArray();
      if (products.length !== ids.length) {
        throw new ApiError(400, 'validation_error', 'Un producto del carrito ya no existe');
      }
      const byId = new Map(products.map((product) => [product._id.toHexString(), product]));
      const lines: TicketDoc['lines'] = [...wanted].map(([id, quantity]) => {
        const product = byId.get(id)!;
        return {
          productId: product._id,
          name: product.name,
          quantity,
          unitPriceCents: product.priceCents,
          unitCostCents: product.costCents ?? 0,
        };
      });

      const now = new Date();
      const taken: TicketDoc['lines'] = [];
      const putBack = () =>
        Promise.all(
          taken.map((line) =>
            c.products.updateOne({ _id: line.productId }, { $inc: { quantity: line.quantity } }),
          ),
        );

      for (const line of lines) {
        const { matchedCount } = await c.products.updateOne(
          { _id: line.productId, quantity: { $gte: line.quantity } },
          { $inc: { quantity: -line.quantity }, $set: { updatedAt: now } },
        );
        if (!matchedCount) {
          await putBack();
          throw new ApiError(409, 'conflict', `No hay suficiente stock de «${line.name}»`);
        }
        taken.push(line);
      }

      const totalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
      try {
        for (let attempt = 1; ; attempt++) {
          const last = await c.tickets.findOne(
            {},
            { sort: { number: -1 }, projection: { number: 1 } },
          );
          const doc: TicketDoc = {
            _id: new ObjectId(),
            number: (last?.number ?? 0) + 1,
            lines,
            totalCents,
            createdAt: now,
          };
          try {
            await c.tickets.insertOne(doc);
            return await reply.status(201).send(toTicket(doc));
          } catch (error) {
            if (!isDuplicateKey(error) || attempt === NUMBER_ATTEMPTS) throw error;
          }
        }
      } catch (error) {
        await putBack();
        throw error;
      }
    },
  );

  /** Units sold per product over every ticket, best seller first. */
  app.get(
    '/sales/top-products',
    { schema: { response: { 200: z.array(ProductSalesSchema) } } },
    async () => {
      const rows = await c.tickets
        .aggregate<{ _id: ObjectId; units: number }>([
          { $unwind: '$lines' },
          { $group: { _id: '$lines.productId', units: { $sum: '$lines.quantity' } } },
          { $sort: { units: -1, _id: 1 } },
        ])
        .toArray();
      return rows.map((row) => ({ productId: row._id.toHexString(), units: row.units }));
    },
  );
};
