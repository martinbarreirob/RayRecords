import type { Routes } from '@angular/router';
import { ListDetailPage } from './list-detail-page';
import { ListsPage } from './lists-page';

export const LISTS_ROUTES: Routes = [
  { path: '', component: ListsPage },
  { path: ':slug', component: ListDetailPage },
];
