import type { Routes } from '@angular/router';
import { EVENTS_LIST_SLUG } from '@rayrecords/shared';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { EventsPage } from './events-page';
import { ListDetailPage } from './list-detail-page';
import { ListsPage } from './lists-page';

export const LISTS_ROUTES: Routes = [
  {
    path: '',
    providers: [providePrimeNgTheme()],
    children: [
      { path: '', component: ListsPage },
      // The locked list of the calendar's events; its slug is reserved, no real list takes it.
      { path: EVENTS_LIST_SLUG, component: EventsPage },
      { path: ':slug', component: ListDetailPage },
    ],
  },
];
