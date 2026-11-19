import {
  CATEGORY_ICONS,
  CategorizationRuleSchema,
  CategorySchema,
  CategoryUsageSchema,
  CreateCategorySchema,
  CreateRuleSchema,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_COLOR,
  ImportBatchSchema,
  ImportResultSchema,
  MonthlyCategoryTotalSchema,
  ObjectIdString,
  SetTransactionCategorySchema,
  SummaryQuerySchema,
  TRANSFER_CATEGORY,
  TransactionPageSchema,
  TransactionQuerySchema,
  TransactionSchema,
  UpdateCategorySchema,
  UpdateRuleSchema,
  FieldKey,
  type Category,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MongoBulkWriteError, ObjectId, type Filter } from 'mongodb';
import { z } from 'zod';
import type { CategoryDoc, RuleDoc, TransactionDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { isDuplicateKey } from '../../http/mongo';
import { categoryNameKey, freeKey } from '../categories/naming';
import { applyRulesToUncategorized } from './apply-rules';
import { CsvFormatError, decodeCsv, parseBankCsv } from './csv';
import { toDateOnly, toTransaction } from './mapper';
import { normalizeDescription } from './normalize';
import { prepareTransactions } from './prepare';

const IdParams = z.object({ id: ObjectIdString });
const KeyParams = z.object({ key: FieldKey });
const MAX_CSV_BYTES = 5 * 1024 * 1024;

const toRule = (doc: RuleDoc) => ({
  id: doc._id.toHexString(),
  pattern: doc.pattern,
  matchType: doc.matchType,
  categoryKey: doc.categoryKey,
  priority: doc.priority,
  active: doc.active,
});

/**
 * Categories saved before they had a look get the default one, and so does an icon that is no
 * longer on the list. The old single `color` was a strong hue meant for text and dots: without
 * its icon color it would not read as a square, so it is not reused.
 */
function toCategory(doc: CategoryDoc): Category {
  const icon = CATEGORY_ICONS.find((name) => name === doc.icon);
  const styled = icon !== undefined && doc.color !== undefined && doc.iconColor !== undefined;
  return {
    key: doc._id,
    name: doc.name,
    icon: icon ?? DEFAULT_CATEGORY_ICON,
    color: styled ? doc.color! : DEFAULT_CATEGORY_COLOR,
    iconColor: styled ? doc.iconColor! : DEFAULT_CATEGORY_ICON_COLOR,
  };
}

function assertRegex(matchType: string | undefined, pattern: string | undefined): void {
  if (matchType !== 'regex' || pattern === undefined) return;
  try {
    new RegExp(pattern, 'i');
  } catch {
    throw new ApiError(400, 'validation_error', 'La expresión regular no es válida');
  }
}

/** Categories, rules, transactions, statement import and the monthly summary. */
export const expensesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.data;

  /** Two categories cannot share a name, ignoring accents and capitals. */
  async function assertNameFree(name: string, exceptKey?: string): Promise<void> {
    const wanted = categoryNameKey(name);
    const taken = (await c.categories.find().toArray()).some(
      (doc) => doc._id !== exceptKey && categoryNameKey(doc.name) === wanted,
    );
    if (taken) throw new ApiError(409, 'conflict', `Ya existe la categoría «${name}»`);
  }

  async function assertCategoryExists(key: string): Promise<void> {
    if (!(await c.categories.findOne({ _id: key }, { projection: { _id: 1 } }))) {
      throw new ApiError(400, 'validation_error', `La categoría «${key}» no existe`);
    }
  }

  // Categories

  app.get('/categories', { schema: { response: { 200: z.array(CategorySchema) } } }, async () => {
    const docs = await c.categories.find().sort({ name: 1 }).toArray();
    return docs.map(toCategory);
  });

  /** Transactions per category, so the manager can say what deleting one affects. */
  app.get('/categories/usage', { schema: { response: { 200: CategoryUsageSchema } } }, async () => {
    const rows = await c.transactions
      .aggregate<{ _id: string; count: number }>([
        { $match: { category: { $type: 'string' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ])
      .toArray();
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  });

  app.post(
    '/categories',
    { schema: { body: CreateCategorySchema, response: { 201: CategorySchema } } },
    async (request, reply) => {
      const { key: given, name, icon, color, iconColor } = request.body;
      await assertNameFree(name);
      const taken = new Set((await c.categories.find().toArray()).map((doc) => doc._id));
      const key = given ?? freeKey(name, taken);
      const doc: CategoryDoc = { _id: key, name, icon, color, iconColor };
      try {
        await c.categories.insertOne(doc);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ApiError(409, 'conflict', `Ya existe la categoría «${key}»`);
        }
        throw error;
      }
      return reply.status(201).send(toCategory(doc));
    },
  );

  app.patch(
    '/categories/:key',
    {
      schema: { params: KeyParams, body: UpdateCategorySchema, response: { 200: CategorySchema } },
    },
    async (request) => {
      const { key } = request.params;
      if (request.body.name !== undefined) await assertNameFree(request.body.name, key);
      const current = await c.categories.findOne({ _id: key });
      if (!current) throw new ApiError(404, 'not_found', 'La categoría no existe');
      // The first change to a category saved without a look settles the whole look, so the part
      // that was not touched does not stay undefined.
      const look = toCategory(current);
      const doc = await c.categories.findOneAndUpdate(
        { _id: key },
        {
          $set: {
            name: look.name,
            icon: look.icon,
            color: look.color,
            iconColor: look.iconColor,
            ...request.body,
          },
        },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'La categoría no existe');
      return toCategory(doc);
    },
  );

  app.delete(
    '/categories/:key',
    { schema: { params: KeyParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const { key } = request.params;
      const [rules, transactions] = await Promise.all([
        c.rules.countDocuments({ categoryKey: key }),
        c.transactions.countDocuments({ category: key }),
      ]);
      if (rules || transactions) {
        throw new ApiError(
          409,
          'conflict',
          `La categoría «${key}» está en uso (${rules} reglas, ${transactions} movimientos)`,
        );
      }
      const { deletedCount } = await c.categories.deleteOne({ _id: key });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'La categoría no existe');
      return reply.status(204).send(null);
    },
  );

  // Rules

  app.get(
    '/rules',
    { schema: { response: { 200: z.array(CategorizationRuleSchema) } } },
    async () => (await c.rules.find().sort({ priority: -1, _id: 1 }).toArray()).map(toRule),
  );

  app.post(
    '/rules',
    { schema: { body: CreateRuleSchema, response: { 201: CategorizationRuleSchema } } },
    async (request, reply) => {
      assertRegex(request.body.matchType, request.body.pattern);
      await assertCategoryExists(request.body.categoryKey);
      const doc: RuleDoc = { _id: new ObjectId(), ...request.body };
      await c.rules.insertOne(doc);
      return reply.status(201).send(toRule(doc));
    },
  );

  app.patch(
    '/rules/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateRuleSchema,
        response: { 200: CategorizationRuleSchema },
      },
    },
    async (request) => {
      const _id = new ObjectId(request.params.id);
      const current = await c.rules.findOne({ _id });
      if (!current) throw new ApiError(404, 'not_found', 'La regla no existe');
      assertRegex(
        request.body.matchType ?? current.matchType,
        request.body.pattern ?? current.pattern,
      );
      if (request.body.categoryKey) await assertCategoryExists(request.body.categoryKey);
      const doc = await c.rules.findOneAndUpdate(
        { _id },
        { $set: request.body },
        { returnDocument: 'after' },
      );
      return toRule(doc!);
    },
  );

  app.delete(
    '/rules/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const { deletedCount } = await c.rules.deleteOne({ _id: new ObjectId(request.params.id) });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'La regla no existe');
      return reply.status(204).send(null);
    },
  );

  /** Re-applies the rules to uncategorized transactions. Never touches the ones corrected by hand. */
  app.post(
    '/rules/apply',
    { schema: { response: { 200: z.object({ updated: z.number().int() }) } } },
    async () => ({ updated: await applyRulesToUncategorized(c) }),
  );

  // Transactions

  app.get(
    '/transactions',
    {
      schema: { querystring: TransactionQuerySchema, response: { 200: TransactionPageSchema } },
    },
    async (request) => {
      const { accountId, month, category, q, limit, offset } = request.query;
      const filter: Filter<TransactionDoc> = {};
      if (accountId) filter.accountId = new ObjectId(accountId);
      if (month) filter.month = month;
      if (category) filter.category = category === 'none' ? null : category;
      if (q) filter.descriptionNorm = { $regex: escapeRegex(normalizeDescription(q)) };

      const [docs, total] = await Promise.all([
        c.transactions.find(filter).sort({ date: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
        c.transactions.countDocuments(filter),
      ]);
      return { items: docs.map(toTransaction), total };
    },
  );

  /** Manual correction: stored as `manual`, and rules never overwrite it. */
  app.patch(
    '/transactions/:id/category',
    {
      schema: {
        params: IdParams,
        body: SetTransactionCategorySchema,
        response: { 200: TransactionSchema },
      },
    },
    async (request) => {
      const { category, createRule } = request.body;
      if (category !== null) await assertCategoryExists(category);

      const doc = await c.transactions.findOneAndUpdate(
        { _id: new ObjectId(request.params.id) },
        { $set: { category, categorySource: category === null ? 'none' : 'manual' } },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'El movimiento no existe');

      if (createRule && category !== null) {
        await c.rules.insertOne({
          _id: new ObjectId(),
          pattern: doc.descriptionNorm.slice(0, 200),
          matchType: 'contains',
          categoryKey: category,
          priority: 10, // above the default rules: the user's correction wins
          active: true,
        });
      }
      return toTransaction(doc);
    },
  );

  // Import

  // The statement arrives as a raw `text/csv` body, not multipart, to avoid another dependency.
  app.addContentTypeParser(
    ['text/csv', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: MAX_CSV_BYTES },
    (_request, body, done) => done(null, body),
  );

  /**
   * Imports a CSV statement into an account. With `dryRun=true` it only returns the preview (what
   * would be imported and what is a duplicate). Re-importing an overlapping statement does not
   * duplicate transactions.
   */
  app.post(
    '/accounts/:id/imports',
    {
      bodyLimit: MAX_CSV_BYTES,
      schema: {
        params: IdParams,
        querystring: z.object({
          fileName: z.string().trim().min(1).max(200).default('extracto.csv'),
          dryRun: z.enum(['true', 'false']).default('false'),
        }),
        response: { 200: ImportResultSchema },
      },
    },
    async (request) => {
      const accountId = new ObjectId(request.params.id);
      const { fileName } = request.query;
      const dryRun = request.query.dryRun === 'true';
      if (!(await c.accounts.findOne({ _id: accountId }, { projection: { _id: 1 } }))) {
        throw new ApiError(404, 'not_found', 'La cuenta no existe');
      }
      if (!Buffer.isBuffer(request.body)) {
        throw new ApiError(
          400,
          'invalid_csv',
          'Envía el fichero como cuerpo con Content-Type text/csv',
        );
      }

      let parsed;
      try {
        parsed = parseBankCsv(decodeCsv(request.body));
      } catch (error) {
        if (error instanceof CsvFormatError) throw new ApiError(400, 'invalid_csv', error.message);
        throw error;
      }
      if (parsed.rows.length === 0) {
        throw new ApiError(400, 'invalid_csv', 'El CSV no contiene movimientos válidos');
      }

      const rules = await c.rules.find({ active: true }).toArray();
      const batchId = new ObjectId();
      const prepared = prepareTransactions({
        accountId,
        rows: parsed.rows,
        rules,
        importBatchId: batchId,
      });
      const existing = new Set(
        (
          await c.transactions
            .find({ accountId, hash: { $in: prepared.map((t) => t.hash) } })
            .project<{ hash: string }>({ hash: 1 })
            .toArray()
        ).map((t) => t.hash),
      );
      const fresh = prepared.filter((t) => !existing.has(t.hash));

      let imported = fresh.length;
      let createdBatchId: string | undefined;
      if (!dryRun && fresh.length > 0) {
        try {
          await c.transactions.insertMany(
            fresh.map((t) => ({ _id: new ObjectId(), ...t })),
            { ordered: false },
          );
        } catch (error) {
          // Race with a concurrent import: duplicates are rejected by the unique index.
          if (!(error instanceof MongoBulkWriteError)) throw error;
          imported = error.insertedCount;
        }
        if (imported > 0) {
          await c.importBatches.insertOne({
            _id: batchId,
            accountId,
            fileName,
            imported,
            skipped: prepared.length - imported,
            createdAt: new Date(),
          });
          createdBatchId = batchId.toHexString();
        }
      }

      return {
        dryRun,
        ...(createdBatchId && { batchId: createdBatchId }),
        fileName,
        parsed: prepared.length,
        imported,
        skipped: prepared.length - imported,
        uncategorized: fresh.filter((t) => t.category === null).length,
        warnings: parsed.warnings.slice(0, 50),
        preview: prepared.slice(0, 20).map((t) => ({
          date: toDateOnly(t.date),
          description: t.description,
          amountCents: t.amountCents,
          category: t.category,
          duplicate: existing.has(t.hash),
        })),
      };
    },
  );

  app.get('/imports', { schema: { response: { 200: z.array(ImportBatchSchema) } } }, async () => {
    const docs = await c.importBatches.find().sort({ createdAt: -1 }).limit(50).toArray();
    return docs.map((doc) => ({
      id: doc._id.toHexString(),
      ...(doc.accountId && { accountId: doc.accountId.toHexString() }),
      fileName: doc.fileName,
      imported: doc.imported,
      skipped: doc.skipped,
      createdAt: doc.createdAt.toISOString(),
    }));
  });

  /** Undoes a whole import: deletes all its transactions (including hand-recategorized ones). */
  app.delete(
    '/imports/:id',
    {
      schema: {
        params: IdParams,
        response: { 200: z.object({ deleted: z.number().int() }) },
      },
    },
    async (request) => {
      const _id = new ObjectId(request.params.id);
      const { deletedCount } = await c.importBatches.deleteOne({ _id });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'La importación no existe');
      const result = await c.transactions.deleteMany({ importBatchId: _id });
      return { deleted: result.deletedCount };
    },
  );

  // Summary

  /** Expense (or income) per month and category. Transfers between own accounts do not count. */
  app.get(
    '/expenses/summary',
    {
      schema: {
        querystring: SummaryQuerySchema,
        response: { 200: z.array(MonthlyCategoryTotalSchema) },
      },
    },
    async (request) => {
      const { from, to, accountId, type } = request.query;
      const rows = await c.transactions
        .aggregate<{
          _id: { month: string; category: string | null };
          total: number;
          count: number;
        }>([
          {
            $match: {
              month: { $gte: from, $lte: to },
              amountCents: type === 'expense' ? { $lt: 0 } : { $gt: 0 },
              category: { $ne: TRANSFER_CATEGORY },
              ...(accountId && { accountId: new ObjectId(accountId) }),
            },
          },
          {
            $group: {
              _id: { month: '$month', category: '$category' },
              total: { $sum: '$amountCents' },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.month': 1, '_id.category': 1 } },
        ])
        .toArray();
      return rows.map((row) => ({
        month: row._id.month,
        category: row._id.category,
        totalCents: row.total,
        count: row.count,
      }));
    },
  );
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
