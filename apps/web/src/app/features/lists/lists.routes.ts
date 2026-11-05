import type { Routes } from '@angular/router';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { ListDetailPage } from './list-detail-page';
import { ListsPage } from './lists-page';

export const LISTS_ROUTES: Routes = [
  {
    path: '',
    providers: [providePrimeNgTheme()],
    children: [
      { path: '', component: ListsPage },
      { path: ':slug', component: ListDetailPage },
    ],
  },
];
