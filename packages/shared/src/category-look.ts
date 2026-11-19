/**
 * What a category can look like, in stock and in expenses alike: an icon on a colored square.
 * Kept apart from the Zod schemas so the web app can offer these lists without pulling Zod into
 * its bundle.
 */

/**
 * Icons a category can use; each is a Tabler Icons name. The web draws them from a generated
 * module: after changing this list run `pnpm --filter @rayrecords/web icons:tabler`.
 */
export const CATEGORY_ICONS = [
  'tag',
  'shopping-bag',
  'backpack',
  'briefcase',
  'wallet',
  'shirt',
  'shirt-sport',
  'jacket',
  'hanger',
  'shoe',
  'sock',
  'umbrella',
  'sunglasses',
  'eyeglass',
  'device-watch',
  'diamond',
  'crown',
  'sparkles',
  'bow',
  'perfume',
  'needle-thread',
  'scissors',
  'heart',
  'star',
  'award',
  'gift',
  'discount',
  'currency-euro',
  'building-store',
  'package',
  'box',
  'truck',
  'trophy',
  'home',
  'sofa',
  'lamp',
  'candle',
  'plant',
  'flower',
  'paw',
  'book',
  'device-mobile',
  'headphones',
  'camera',
  'palette',
  'coffee',
  'bottle',
  'cake',
  'shopping-cart',
  'basket',
  'car',
  'bus',
  'plane',
  'bike',
  'gas-station',
  'tools-kitchen-2',
  'beer',
  'pizza',
  'heartbeat',
  'pill',
  'stethoscope',
  'first-aid-kit',
  'school',
  'movie',
  'device-gamepad-2',
  'music',
  'ticket',
  'run',
  'yoga',
  'dog',
  'tool',
  'droplet',
  'wifi',
  'device-laptop',
  'phone',
  'world-www',
  'bed',
  'flame',
  'leaf',
  'receipt',
  'cash',
  'coins',
  'credit-card',
  'building-bank',
  'pig-money',
  'arrows-exchange',
  'repeat',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/**
 * Suggested looks: the square and an icon color that reads on it, picked together with one
 * click. Any `#rrggbb` is still accepted for either.
 */
export const CATEGORY_COLOR_PAIRS: readonly { color: string; iconColor: string }[] = [
  { color: '#ededed', iconColor: '#2b2b2b' },
  { color: '#2b2b2b', iconColor: '#ffffff' },
  { color: '#e8effc', iconColor: '#1d4fb8' },
  { color: '#d9f2ee', iconColor: '#0f766e' },
  { color: '#e6f3dc', iconColor: '#3f7d20' },
  { color: '#fdecc8', iconColor: '#b45309' },
  { color: '#fde4d3', iconColor: '#c2410c' },
  { color: '#fde2e8', iconColor: '#be123c' },
  { color: '#f6e1f9', iconColor: '#a21caf' },
  { color: '#ebe4fb', iconColor: '#6d28d9' },
];

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Look of a category created without choosing one: a dark tag on light gray. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'tag';
export const DEFAULT_CATEGORY_COLOR = '#ededed';
export const DEFAULT_CATEGORY_ICON_COLOR = '#2b2b2b';
