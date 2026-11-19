import type { Category, CreateRule } from '../schemas/category';

/**
 * The ten categories, one word each, in this order: the order fixes the 1-9 and 0 shortcuts of the
 * review screen, so each number always means the same thing.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  // fuel, insurance, garage, parking...
  { key: 'coche', name: 'Coche', icon: 'car', color: '#e8effc', iconColor: '#1d4fb8' },
  // housing, groceries and bills
  { key: 'hogar', name: 'Hogar', icon: 'home', color: '#fdecc8', iconColor: '#b45309' },
  { key: 'salud', name: 'Salud', icon: 'heartbeat', color: '#d9f2ee', iconColor: '#0f766e' },
  // bars, cafes and restaurants
  {
    key: 'restauracion',
    name: 'Restauración',
    icon: 'tools-kitchen-2',
    color: '#fde4d3',
    iconColor: '#c2410c',
  },
  { key: 'ocio', name: 'Ocio', icon: 'movie', color: '#fde2e8', iconColor: '#be123c' },
  {
    key: 'compras',
    name: 'Compras',
    icon: 'shopping-bag',
    color: '#f6e1f9',
    iconColor: '#a21caf',
  },
  {
    key: 'suscripciones',
    name: 'Suscripciones',
    icon: 'repeat',
    color: '#ebe4fb',
    iconColor: '#6d28d9',
  },
  // Cash, fees, loans and moves between own accounts: counted as neither expense nor income.
  {
    key: 'traspaso',
    name: 'Traspasos',
    icon: 'arrows-exchange',
    color: '#ededed',
    iconColor: '#2b2b2b',
  },
  { key: 'ingresos', name: 'Ingresos', icon: 'cash', color: '#e6f3dc', iconColor: '#3f7d20' },
  // shortcut 0: whatever fits nowhere else
  { key: 'otros', name: 'Otros', icon: 'tag', color: '#ededed', iconColor: '#2b2b2b' },
];

/**
 * Categories from earlier versions and the one that replaces each. `null`: no clear replacement, so
 * its transactions go back to the review queue.
 */
export const LEGACY_CATEGORY_MAP: Readonly<Record<string, string | null>> = {
  supermercado: 'hogar',
  vivienda: 'hogar',
  telefonia: 'hogar',
  'mensualidad-hogar': 'hogar',
  impuestos: 'hogar',
  transporte: 'coche',
  seguros: 'coche',
  restaurantes: 'restauracion',
  cafeteria: 'restauracion',
  'cuidado-personal': 'salud',
  ropa: 'compras',
  'compras-online': 'compras',
  tecnologia: 'compras',
  regalos: 'compras',
  'compras-aplazadas': 'compras',
  deporte: 'ocio',
  cuotas: 'ocio',
  efectivo: 'traspaso',
  comisiones: 'traspaso',
  prestamos: 'traspaso',
  prestamo: 'traspaso',
  'bizum-personas': 'traspaso',
  familia: null,
};

/** Patterns are matched against the normalized description (lowercase, no accents). */
export const DEFAULT_RULES: CreateRule[] = [
  {
    pattern: 'mercadona',
    matchType: 'contains',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: 'carrefour',
    matchType: 'contains',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: 'lidl',
    matchType: 'contains',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: '\\bdia\\b',
    matchType: 'regex',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: 'telepizza',
    matchType: 'contains',
    categoryKey: 'restauracion',
    priority: 0,
    active: true,
  },
  {
    pattern: 'restaurante',
    matchType: 'contains',
    categoryKey: 'restauracion',
    priority: 0,
    active: true,
  },
  { pattern: 'renfe', matchType: 'contains', categoryKey: 'coche', priority: 0, active: true },
  {
    pattern: 'repsol',
    matchType: 'contains',
    categoryKey: 'coche',
    priority: 0,
    active: true,
  },
  {
    pattern: 'cabify',
    matchType: 'contains',
    categoryKey: 'coche',
    priority: 0,
    active: true,
  },
  {
    pattern: 'alquiler',
    matchType: 'contains',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: 'iberdrola',
    matchType: 'contains',
    categoryKey: 'hogar',
    priority: 0,
    active: true,
  },
  {
    pattern: 'netflix',
    matchType: 'contains',
    categoryKey: 'suscripciones',
    priority: 0,
    active: true,
  },
  {
    pattern: 'spotify',
    matchType: 'contains',
    categoryKey: 'suscripciones',
    priority: 0,
    active: true,
  },
  {
    pattern: 'gimnasio',
    matchType: 'contains',
    categoryKey: 'suscripciones',
    priority: 0,
    active: true,
  },
  { pattern: 'cines', matchType: 'contains', categoryKey: 'ocio', priority: 0, active: true },
  { pattern: 'steam', matchType: 'contains', categoryKey: 'ocio', priority: 0, active: true },
  { pattern: 'farmacia', matchType: 'contains', categoryKey: 'salud', priority: 0, active: true },
  { pattern: 'nomina', matchType: 'contains', categoryKey: 'ingresos', priority: 10, active: true },
];
