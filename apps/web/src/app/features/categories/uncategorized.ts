import type { CategoryLook } from './category-badge';

/**
 * What "Sin categoría" looks like: it is not a category the user owns, but it is shown beside
 * the real ones and so it has a badge too (a question mark on a warm square, the color of
 * something that still needs a decision).
 */
export const UNCATEGORIZED_LOOK: CategoryLook = {
  icon: 'help-circle',
  color: '#fdecc8',
  iconColor: '#b45309',
};

/** Name of the bucket for what has no category (movements, products, sales). */
export const NO_CATEGORY = 'Sin categoría';
