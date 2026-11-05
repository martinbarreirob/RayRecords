import type { Category, CreateRule } from '../schemas/category';

/**
 * The ten categories, one word each, in this order: the order fixes the 1-9 and 0 shortcuts of the
 * review screen, so each number always means the same thing.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'coche', name: 'Coche', color: '#3b6fe0' }, // fuel, insurance, garage, parking...
  { key: 'hogar', name: 'Hogar', color: '#8d6e63' }, // housing, groceries and bills
  { key: 'salud', name: 'Salud', color: '#1f9aa8' },
  { key: 'restauracion', name: 'Restauración', color: '#d98a1b' }, // bars, cafes and restaurants
  { key: 'ocio', name: 'Ocio', color: '#d9455f' },
  { key: 'compras', name: 'Compras', color: '#b84fc4' },
  { key: 'suscripciones', name: 'Suscripciones', color: '#7c5ce0' },
  // Cash, fees, loans and moves between own accounts: counted as neither expense nor income.
  { key: 'traspaso', name: 'Traspasos', color: '#607d8b' },
  { key: 'ingresos', name: 'Ingresos', color: '#4caf50' },
  { key: 'otros', name: 'Otros', color: '#9e9e9e' }, // shortcut 0: whatever fits nowhere else
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
