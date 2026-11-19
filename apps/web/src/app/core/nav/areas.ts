/**
 * The app has two areas: the personal one (notes, lists, calendar, expenses) and the management one
 * (dashboard, stock, sales, tickets). The top bar shows the area and the second bar its sections.
 * Pure data and functions, with no Angular and no Zod, so the shell can use them without cost.
 */

export type AreaId = 'personal' | 'gestion';

export interface Section {
  readonly label: string;
  readonly url: string;
}

export interface Area {
  readonly id: AreaId;
  readonly label: string;
  /** Where the area tab goes the first time (afterwards, to the last section visited there). */
  readonly home: string;
  readonly sections: readonly Section[];
}

export const AREAS: readonly Area[] = [
  {
    id: 'personal',
    label: 'Personal',
    home: '/notas',
    sections: [
      { label: 'Notas', url: '/notas' },
      { label: 'Listas', url: '/listas' },
      { label: 'Calendario', url: '/calendario' },
      { label: 'Gastos', url: '/gastos' },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestión',
    home: '/gestion/dashboard',
    sections: [
      { label: 'Dashboard', url: '/gestion/dashboard' },
      { label: 'Stock', url: '/gestion/stock' },
      { label: 'Ventas', url: '/gestion/ventas' },
      { label: 'Tickets', url: '/gestion/tickets' },
    ],
  },
];

/** Area an address belongs to: everything under `/gestion` is management, the rest is personal. */
export function areaOf(url: string): AreaId {
  const first = url.split(/[?#]/)[0]?.split('/')[1] ?? '';
  return first === 'gestion' ? 'gestion' : 'personal';
}

/** Section an address is inside of (`/listas/compras` is `Listas`), if any. */
export function sectionOf(url: string): Section | undefined {
  const path = url.split(/[?#]/)[0] ?? '';
  return AREAS.flatMap((area) => area.sections).find(
    (section) => path === section.url || path.startsWith(`${section.url}/`),
  );
}

export function areaById(id: AreaId): Area {
  return AREAS.find((area) => area.id === id) ?? AREAS[0]!;
}

/** The sections of the management area, for the places that list them (the command palette). */
export const MANAGEMENT_SECTIONS: readonly Section[] = areaById('gestion').sections;
