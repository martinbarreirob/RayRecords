import type { Routes } from '@angular/router';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { ExpensesPage } from './expenses-page';

export const EXPENSES_ROUTES: Routes = [
  { path: '', component: ExpensesPage, providers: [providePrimeNgTheme()] },
];
