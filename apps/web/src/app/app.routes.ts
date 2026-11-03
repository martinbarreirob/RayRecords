import type { Routes } from '@angular/router';

/**
 * Una sección por módulo funcional, cada una con carga diferida: el bundle inicial solo
 * contiene el shell y cada módulo se descarga al entrar en él.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'notas' },
  {
    path: 'notas',
    title: 'Notas del día · RayRecords',
    loadChildren: () => import('./features/notes/notes.routes').then((m) => m.NOTES_ROUTES),
  },
  {
    path: 'listas',
    title: 'Listas · RayRecords',
    loadChildren: () => import('./features/lists/lists.routes').then((m) => m.LISTS_ROUTES),
  },
  {
    path: 'calendario',
    title: 'Calendario · RayRecords',
    loadChildren: () =>
      import('./features/calendar/calendar.routes').then((m) => m.CALENDAR_ROUTES),
  },
  {
    path: 'gastos',
    title: 'Gastos · RayRecords',
    loadChildren: () =>
      import('./features/expenses/expenses.routes').then((m) => m.EXPENSES_ROUTES),
  },
  {
    path: 'cuentas',
    title: 'Cuentas · RayRecords',
    loadChildren: () =>
      import('./features/accounts/accounts.routes').then((m) => m.ACCOUNTS_ROUTES),
  },
  { path: '**', redirectTo: 'notas' },
];
