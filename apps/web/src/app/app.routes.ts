import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Una sección por módulo funcional, cada una con carga diferida: el bundle inicial solo
 * contiene el shell y cada módulo se descarga al entrar en él. Todo menos `/login` exige sesión.
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
