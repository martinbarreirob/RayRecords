import {
  CategorizationRuleSchema,
  CategorySchema,
  CreateRuleSchema,
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
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { MongoBulkWriteError, ObjectId, type Filter } from 'mongodb';
import { z } from 'zod';
import type { RuleDoc, TransactionDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { isDuplicateKey } from '../../http/mongo';
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

function assertRegex(matchType: string | undefined, pattern: string | undefined): void {
  if (matchType !== 'regex' || pattern === undefined) return;
  try {
    new RegExp(pattern, 'i');
  } catch {
    throw new ApiError(400, 'validation_error', 'La expresión regular no es válida');
  }
}

/** Categorías, reglas, movimientos, importación de extractos y resumen mensual. */
export const expensesRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  async function assertCategoryExists(key: string): Promise<void> {
    if (!(await c.categories.findOne({ _id: key }, { projection: { _id: 1 } }))) {
      throw new ApiError(400, 'validation_error', `La categoría «${key}» no existe`);
    }
  }

  // ───────────────────────── categorías ─────────────────────────

  app.get('/categories', { schema: { response: { 200: z.array(CategorySchema) } } }, async () => {
    const docs = await c.categories.find().sort({ name: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({ key: _id, ...rest }));
  });

  app.post(
    '/categories',
    { schema: { body: CategorySchema, response: { 201: CategorySchema } } },
    async (request, reply) => {
      const { key, ...rest } = request.body;
      try {
        await c.categories.insertOne({ _id: key, ...rest });
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ApiError(409, 'conflict', `Ya existe la categoría «${key}»`);
        }
        throw error;
      }
      return reply.status(201).send(request.body);
    },
  );

  app.patch(
    '/categories/:key',
    {
      schema: { params: KeyParams, body: UpdateCategorySchema, response: { 200: CategorySchema } },
    },
    async (request) => {
      const doc = await c.categories.findOneAndUpdate(
        { _id: request.params.key },
        { $set: request.body },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'La categoría no existe');
      const { _id, ...rest } = doc;
      return { key: _id, ...rest };
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

  // ───────────────────────── reglas ─────────────────────────

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

  /** Reaplica las reglas a los movimientos sin categoría. Nunca toca los corregidos a mano. */
  app.post(
    '/rules/apply',
    { schema: { response: { 200: z.object({ updated: z.number().int() }) } } },
    async () => ({ updated: await applyRulesToUncategorized(c) }),
  );

  // ───────────────────────── movimientos ─────────────────────────

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

  /** Corrección manual: queda como `manual` y las reglas nunca la sobrescriben. */
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
          priority: 10, // por encima de las reglas por defecto: la corrección del usuario gana
          active: true,
        });
      }
      return toTransaction(doc);
    },
  );

  // ───────────────────────── importación ─────────────────────────

  // El extracto llega como cuerpo en bruto (`text/csv`), sin multipart: no hace falta otra dependencia.
  app.addContentTypeParser(
    ['text/csv', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: MAX_CSV_BYTES },
    (_request, body, done) => done(null, body),
  );

  /**
   * Importa un extracto CSV en una cuenta. Con `dryRun=true` solo devuelve la vista previa
   * (qué se importaría y qué es duplicado). Reimportar un extracto solapado no duplica movimientos.
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
          // Carrera con otra importación simultánea: los duplicados saltan por el índice único.
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

  /** Deshacer una importación completa: borra todos sus movimientos (también los recategorizados a mano). */
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

  // ───────────────────────── resumen ─────────────────────────

  /** Gasto (o ingreso) por mes y categoría. Los traspasos entre cuentas propias no cuentan. */
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
