import {
  CreateProductSchema,
  CreateStockCategorySchema,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_COLOR,
  ObjectIdString,
  ProductSchema,
  CATEGORY_ICONS,
  StockCategorySchema,
  UpdateProductSchema,
  UpdateStockCategorySchema,
  type Product,
  type StockCategory,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { ProductDoc, StockCategoryDoc } from '../../db/documents';
import { ApiError } from '../../http/errors';
import { isDuplicateKey } from '../../http/mongo';
import { categoryNameKey } from '../categories/naming';

const IdParams = z.object({ id: ObjectIdString });

// The seeder and the tests take the name helper from here.
export { categoryNameKey };

/**
 * Categories saved before they had a look get the default one, and so does an icon that is no
 * longer on the list (the icon set changed once), instead of failing the whole response.
 */
function toCategory(doc: StockCategoryDoc): StockCategory {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    icon: CATEGORY_ICONS.includes(doc.icon) ? doc.icon : DEFAULT_CATEGORY_ICON,
    color: doc.color ?? DEFAULT_CATEGORY_COLOR,
    iconColor: doc.iconColor ?? DEFAULT_CATEGORY_ICON_COLOR,
    createdAt: doc.createdAt.toISOString(),
  };
}

function toProduct(doc: ProductDoc): Product {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    ...(doc.sku !== undefined && { sku: doc.sku }),
    categoryId: doc.categoryId?.toHexString() ?? null,
    quantity: doc.quantity,
    minQuantity: doc.minQuantity,
    priceCents: doc.priceCents,
    costCents: doc.costCents ?? 0,
    ...(doc.notes !== undefined && { notes: doc.notes }),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const stockRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.data;

  async function categoryRef(id: string | null): Promise<ObjectId | null> {
    if (id === null) return null;
    const _id = new ObjectId(id);
    if (!(await c.stockCategories.findOne({ _id }, { projection: { _id: 1 } }))) {
      throw new ApiError(400, 'validation_error', 'La categoría no existe');
    }
    return _id;
  }

  // Categories

  app.get(
    '/stock/categories',
    { schema: { response: { 200: z.array(StockCategorySchema) } } },
    async () => {
      const docs = await c.stockCategories.find().sort({ nameKey: 1 }).toArray();
      return docs.map(toCategory);
    },
  );

  app.post(
    '/stock/categories',
    { schema: { body: CreateStockCategorySchema, response: { 201: StockCategorySchema } } },
    async (request, reply) => {
      const { name } = request.body;
      const doc: StockCategoryDoc = {
        _id: new ObjectId(),
        ...request.body,
        nameKey: categoryNameKey(name),
        createdAt: new Date(),
      };
      try {
        await c.stockCategories.insertOne(doc);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ApiError(409, 'conflict', `Ya existe la categoría «${name}»`);
        }
        throw error;
      }
      return reply.status(201).send(toCategory(doc));
    },
  );

  app.patch(
    '/stock/categories/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateStockCategorySchema,
        response: { 200: StockCategorySchema },
      },
    },
    async (request) => {
      const { name } = request.body;
      try {
        const doc = await c.stockCategories.findOneAndUpdate(
          { _id: new ObjectId(request.params.id) },
          // An empty `$set` is an error in Mongo: an empty body sets the id to itself instead.
          {
            $set: {
              _id: new ObjectId(request.params.id),
              ...request.body,
              ...(name !== undefined && { nameKey: categoryNameKey(name) }),
            },
          },
          { returnDocument: 'after' },
        );
        if (!doc) throw new ApiError(404, 'not_found', 'La categoría no existe');
        return toCategory(doc);
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new ApiError(409, 'conflict', `Ya existe la categoría «${name}»`);
        }
        throw error;
      }
    },
  );

  /** Deleting a category never deletes products: they are left without a category. */
  app.delete(
    '/stock/categories/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const _id = new ObjectId(request.params.id);
      const { deletedCount } = await c.stockCategories.deleteOne({ _id });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'La categoría no existe');
      await c.products.updateMany({ categoryId: _id }, { $set: { categoryId: null } });
      return reply.status(204).send(null);
    },
  );

  // Products

  /** The whole stock, sorted by name: searching and filtering happen in the table. */
  app.get(
    '/stock/products',
    { schema: { response: { 200: z.array(ProductSchema) } } },
    async () => {
      const docs = await c.products
        .find()
        .collation({ locale: 'es', strength: 1 })
        .sort({ name: 1 })
        .toArray();
      return docs.map(toProduct);
    },
  );

  app.post(
    '/stock/products',
    { schema: { body: CreateProductSchema, response: { 201: ProductSchema } } },
    async (request, reply) => {
      const { categoryId, sku, notes, ...rest } = request.body;
      const now = new Date();
      const doc: ProductDoc = {
        _id: new ObjectId(),
        ...rest,
        ...(sku !== undefined && { sku }),
        ...(notes !== undefined && { notes }),
        categoryId: await categoryRef(categoryId),
        createdAt: now,
        updatedAt: now,
      };
      await c.products.insertOne(doc);
      return reply.status(201).send(toProduct(doc));
    },
  );

  app.patch(
    '/stock/products/:id',
    { schema: { params: IdParams, body: UpdateProductSchema, response: { 200: ProductSchema } } },
    async (request) => {
      const { categoryId, sku, notes, ...rest } = request.body;
      const set: Partial<ProductDoc> = { ...rest, updatedAt: new Date() };
      const unset: Record<string, ''> = {};
      if (categoryId !== undefined) set.categoryId = await categoryRef(categoryId);
      if (sku === null) unset['sku'] = '';
      else if (sku !== undefined) set.sku = sku;
      if (notes === null) unset['notes'] = '';
      else if (notes !== undefined) set.notes = notes;

      const doc = await c.products.findOneAndUpdate(
        { _id: new ObjectId(request.params.id) },
        { $set: set, ...(Object.keys(unset).length > 0 && { $unset: unset }) },
        { returnDocument: 'after' },
      );
      if (!doc) throw new ApiError(404, 'not_found', 'El producto no existe');
      return toProduct(doc);
    },
  );

  app.delete(
    '/stock/products/:id',
    { schema: { params: IdParams, response: { 204: z.null() } } },
    async (request, reply) => {
      const { deletedCount } = await c.products.deleteOne({
        _id: new ObjectId(request.params.id),
      });
      if (!deletedCount) throw new ApiError(404, 'not_found', 'El producto no existe');
      return reply.status(204).send(null);
    },
  );
};
