import { z } from 'zod';
import { CATEGORY_ICONS, HEX_COLOR_RE } from '../category-look';

/** Pieces shared by every kind of category (stock and expenses): its name and its look. */
export const CategoryNameSchema = z.string().trim().min(1).max(60);
export const CategoryIconSchema = z.enum(CATEGORY_ICONS);
/** `#rrggbb`, stored in lowercase. */
export const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_RE, 'Invalid color, expected #rrggbb')
  .toLowerCase();
