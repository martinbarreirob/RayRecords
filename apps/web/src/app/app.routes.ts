import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * One lazy-loaded section per feature module: the initial bundle only holds the shell and each
 * module is downloaded on first visit. Everything except `/login` requires a session.
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · RayRecords',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'notas' },
      {
        path: 'notas',
        title: 'Notas · RayRecords',
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
    ],
  },
  { path: '**', redirectTo: '' },
];
