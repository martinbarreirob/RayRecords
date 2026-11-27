import { z } from 'zod';
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_COLOR,
} from '../category-look';
import { Cents, IsoDateTime, ObjectIdString } from './common';
import { CategoryIconSchema, CategoryNameSchema, HexColorSchema } from './look';

const CategoryName = CategoryNameSchema;
const CategoryIcon = CategoryIconSchema;
const HexColor = HexColorSchema;

/**
 * Stock categories are created by the user; there is no preset list. Each one is shown as an
 * icon on a colored square: `color` is the square and `iconColor` the icon.
 */
export const StockCategorySchema = z.object({
  id: ObjectIdString,
  name: CategoryName,
  icon: CategoryIcon,
  color: HexColor,
  iconColor: HexColor,
  createdAt: IsoDateTime,
});
export type StockCategory = z.infer<typeof StockCategorySchema>;

export const CreateStockCategorySchema = z.object({
  name: CategoryName,
  icon: CategoryIcon.default(DEFAULT_CATEGORY_ICON),
  color: HexColor.default(DEFAULT_CATEGORY_COLOR),
  iconColor: HexColor.default(DEFAULT_CATEGORY_ICON_COLOR),
});
export type CreateStockCategory = z.input<typeof CreateStockCategorySchema>;

/** No defaults: a partial PATCH must not reset the look. */
export const UpdateStockCategorySchema = z.object({
  name: CategoryName.optional(),
  icon: CategoryIcon.optional(),
  color: HexColor.optional(),
  iconColor: HexColor.optional(),
});
export type UpdateStockCategory = z.infer<typeof UpdateStockCategorySchema>;

const Quantity = z.number().int().nonnegative().max(1_000_000);

export const ProductSchema = z.object({
  id: ObjectIdString,
  name: z.string().trim().min(1).max(120),
  /** Optional reference or barcode; free text. */
  sku: z.string().trim().min(1).max(40).optional(),
  /** `null` when the product has no category. */
  categoryId: ObjectIdString.nullable(),
  quantity: Quantity,
  /** At or below this quantity the product counts as low on stock; 0 turns the warning off. */
  minQuantity: Quantity,
  /** Unit price: what a customer pays. */
  priceCents: Cents.nonnegative(),
  /** Unit cost: what one unit costs the business. 0 when it is not known. */
  costCents: Cents.nonnegative(),
  notes: z.string().trim().min(1).max(500).optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = z.object({
  name: ProductSchema.shape.name,
  sku: ProductSchema.shape.sku,
  categoryId: ObjectIdString.nullable().default(null),
  quantity: Quantity.default(0),
  minQuantity: Quantity.default(0),
  priceCents: Cents.nonnegative().default(0),
  costCents: Cents.nonnegative().default(0),
  notes: ProductSchema.shape.notes,
});
export type CreateProduct = z.input<typeof CreateProductSchema>;

/** No defaults: a partial PATCH must not reset anything. `null` clears `sku` and `notes`. */
export const UpdateProductSchema = z.object({
  name: ProductSchema.shape.name.optional(),
  sku: z.string().trim().min(1).max(40).nullable().optional(),
  categoryId: ObjectIdString.nullable().optional(),
  quantity: Quantity.optional(),
  minQuantity: Quantity.optional(),
  priceCents: Cents.nonnegative().optional(),
  costCents: Cents.nonnegative().optional(),
  notes: z.string().trim().min(1).max(500).nullable().optional(),
});
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
