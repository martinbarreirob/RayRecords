import {
  ReviewApplyResultSchema,
  ReviewApplySchema,
  ReviewQueueQuerySchema,
  ReviewQueueSchema,
  ReviewUndoSchema,
  type ReviewGroup,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId, type Filter } from 'mongodb';
import { z } from 'zod';
import type { TransactionDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { toDateOnly } from './mapper';
import { suggest } from './suggest';

const MAX_GROUP_IDS = 500;
/** A merchant with amounts this spread out (max/min) mixes different things: no automatic rule. */
const MAX_AMOUNT_SPREAD = 5;

/** Why an automatic rule should NOT be created for this group, or `null` when it is safe. */
function ruleBlockReason(amounts: readonly number[], merchantKey: string | null): string | null {
  if (!merchantKey) return 'El movimiento no tiene un comercio identificable';
  if (amounts.length < 2) return 'Un solo movimiento: aún no hay patrón';
  const abs = amounts.map(Math.abs).filter((a) => a > 0);
  if (abs.length && Math.max(...abs) / Math.min(...abs) > MAX_AMOUNT_SPREAD) {
    return 'Los importes varían demasiado para generalizar';
  }
  return null;
}

interface GroupRow {
  _id: ObjectId | string;
  ids: ObjectId[];
  count: number;
  total: number;
  min: number;
  max: number;
  merchantKey: string | null;
  sampleDescription: string;
  sampleNorm: string;
  firstDate: Date;
  lastDate: Date;
  recent: number[];
}

/**
 * Review queue: uncategorized transactions grouped by merchant and sorted by impact (absolute
 * amount). "Pending" simply means having no category, so it survives between sessions without
 * separate state.
 */
export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  app.get(
    '/review/queue',
    { schema: { querystring: ReviewQueueQuerySchema, response: { 200: ReviewQueueSchema } } },
    async (request) => {
      const { limit, accountId } = request.query;
      const match: Filter<TransactionDoc> = {
        categorySource: 'none',
        ...(accountId && { accountId: new ObjectId(accountId) }),
      };
      // Without a merchant key, each transaction is its own group.
      const groupKey = { $ifNull: ['$merchantKey', '$_id'] };

      const [rows, counts, categories, rules, popularRows] = await Promise.all([
        c.transactions
          .aggregate<GroupRow>([
            { $match: match },
            { $sort: { date: -1, _id: -1 } },
            {
              $group: {
                _id: groupKey,
                ids: { $push: '$_id' },
                count: { $sum: 1 },
                total: { $sum: '$amountCents' },
                absTotal: { $sum: { $abs: '$amountCents' } },
                min: { $min: '$amountCents' },
                max: { $max: '$amountCents' },
                merchantKey: { $first: '$merchantKey' },
                sampleDescription: { $first: '$description' },
                sampleNorm: { $first: '$descriptionNorm' },
                firstDate: { $min: '$date' },
                lastDate: { $max: '$date' },
                recent: { $push: '$amountCents' },
              },
            },
            { $sort: { absTotal: -1, _id: 1 } },
            { $limit: limit },
            {
              $project: {
                ids: { $slice: ['$ids', MAX_GROUP_IDS] },
                count: 1,
                total: 1,
                min: 1,
                max: 1,
                merchantKey: { $ifNull: ['$merchantKey', null] },
                sampleDescription: 1,
                sampleNorm: 1,
                firstDate: 1,
                lastDate: 1,
                recent: { $slice: ['$recent', 4] },
              },
            },
          ])
          .toArray(),
        c.transactions
          .aggregate<{ groups: number; transactions: number }>([
            { $match: match },
            { $group: { _id: groupKey, n: { $sum: 1 } } },
            { $group: { _id: null, groups: { $sum: 1 }, transactions: { $sum: '$n' } } },
          ])
          .toArray(),
        c.categories.find({}, { projection: { _id: 1 } }).toArray(),
        c.rules.find({ active: true }).toArray(),
        c.transactions
          .aggregate<{ _id: string; n: number }>([
            { $match: { category: { $type: 'string' } } },
            { $group: { _id: '$category', n: { $sum: 1 } } },
            { $sort: { n: -1 } },
          ])
          .toArray(),
      ]);

      const keys = rows.map((r) => r.merchantKey).filter((k): k is string => k !== null);
      const historyRows = keys.length
        ? await c.transactions
            .aggregate<{ _id: { key: string; category: string }; n: number }>([
              { $match: { merchantKey: { $in: keys }, category: { $type: 'string' } } },
              { $group: { _id: { key: '$merchantKey', category: '$category' }, n: { $sum: 1 } } },
            ])
            .toArray()
        : [];
      const history = new Map<string, Map<string, number>>();
      for (const { _id, n } of historyRows) {
        const byCategory = history.get(_id.key) ?? new Map<string, number>();
        byCategory.set(_id.category, n);
        history.set(_id.key, byCategory);
      }

      const known = new Set(categories.map((cat) => cat._id));
      const usage = popularRows.map((r) => ({ category: r._id, count: r.n }));
      const popular = usage.slice(0, 8).map((u) => u.category);
      const groups: ReviewGroup[] = rows.map((row) => ({
        merchantKey: row.merchantKey,
        ids: row.ids.map((id) => id.toHexString()),
        count: row.count,
        totalCents: row.total,
        minCents: row.min,
        maxCents: row.max,
        sampleDescription: row.sampleDescription,
        firstDate: toDateOnly(row.firstDate),
        lastDate: toDateOnly(row.lastDate),
        recentCents: row.recent,
        suggestions: suggest({
          merchantKey: row.merchantKey,
          descriptionNorm: row.sampleNorm,
          totalCents: row.total,
          history: (row.merchantKey && history.get(row.merchantKey)) || new Map(),
          rules,
          popular,
          known,
        }),
      }));

      return {
        groups,
        usage,
        pendingTransactions: counts[0]?.transactions ?? 0,
        pendingGroups: counts[0]?.groups ?? 0,
      };
    },
  );

  /** Only the pending counter (cheap: a `count` on the partial index), for the tab badge. */
  app.get(
    '/review/pending',
    { schema: { response: { 200: z.object({ pendingTransactions: z.number().int() }) } } },
    async () => ({
      pendingTransactions: await c.transactions.countDocuments({ categorySource: 'none' }),
    }),
  );

  /** Assigns a category to the given pending transactions and, when safe, creates the merchant rule. */
  app.post(
    '/review/apply',
    { schema: { body: ReviewApplySchema, response: { 200: ReviewApplyResultSchema } } },
    async (request) => {
      const { ids, category, createRule } = request.body;
      const [categoryExists, docs] = await Promise.all([
        c.categories.findOne({ _id: category }, { projection: { _id: 1 } }),
        c.transactions
          .find(
            { _id: { $in: ids.map((id) => new ObjectId(id)) }, categorySource: 'none' },
            { projection: { amountCents: 1, merchantKey: 1 } },
          )
          .toArray(),
      ]);
      if (!categoryExists) {
        throw new ApiError(400, 'validation_error', `La categoría «${category}» no existe`);
      }
      if (docs.length === 0) return { updated: 0, ruleId: null, ruleSkippedReason: null };

      await c.transactions.updateMany(
        { _id: { $in: docs.map((d) => d._id) } },
        { $set: { category, categorySource: 'manual' } },
      );

      // The server computes the key: a rule is only created when all transactions share a merchant.
      const keys = new Set(docs.map((d) => d.merchantKey ?? null));
      const merchantKey = keys.size === 1 ? ([...keys][0] ?? null) : null;

      let ruleId: ObjectId | null = null;
      let ruleSkippedReason: string | null = null;
      if (createRule) {
        ruleSkippedReason = ruleBlockReason(
          docs.map((d) => d.amountCents),
          merchantKey,
        );
        if (!ruleSkippedReason && merchantKey) {
          if (await c.rules.findOne({ pattern: merchantKey, matchType: 'contains' })) {
            ruleSkippedReason = 'Ya existe una regla para este comercio';
          } else {
            ruleId = new ObjectId();
            await c.rules.insertOne({
              _id: ruleId,
              pattern: merchantKey,
              matchType: 'contains',
              categoryKey: category,
              priority: 10, // above the default rules: the user's decision wins
              active: true,
            });
          }
        }
      }
      return { updated: docs.length, ruleId: ruleId?.toHexString() ?? null, ruleSkippedReason };
    },
  );

  /** Undoes a decision: transactions go back to pending and the rule it created is deleted. */
  app.post(
    '/review/undo',
    {
      schema: {
        body: ReviewUndoSchema,
        response: { 200: z.object({ reverted: z.number().int().nonnegative() }) },
      },
    },
    async (request) => {
      const { ids, ruleId } = request.body;
      const result = await c.transactions.updateMany(
        { _id: { $in: ids.map((id) => new ObjectId(id)) }, categorySource: 'manual' },
        { $set: { category: null, categorySource: 'none' } },
      );
      if (ruleId) await c.rules.deleteOne({ _id: new ObjectId(ruleId) });
      return { reverted: result.modifiedCount };
    },
  );
};
