import type { Routes } from '@angular/router';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';

/** The management area: dashboard, stock, sales and tickets, each loaded on first visit. */
export const MANAGEMENT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Gestión · RayRecords',
    loadComponent: () => import('./dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'stock',
    title: 'Stock · Gestión · RayRecords',
    loadComponent: () => import('./stock/stock-page').then((m) => m.StockPage),
    providers: [providePrimeNgTheme()],
  },
  {
    path: 'ventas',
    title: 'Ventas · Gestión · RayRecords',
    loadComponent: () => import('./sales/sales-page').then((m) => m.SalesPage),
  },
  {
    path: 'tickets',
    title: 'Tickets · Gestión · RayRecords',
    loadComponent: () => import('./tickets/tickets-page').then((m) => m.TicketsPage),
    providers: [providePrimeNgTheme()],
  },
];
