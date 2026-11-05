import type { Routes } from '@angular/router';
import { providePrimeNgTheme } from '../../core/theme/provide-primeng';
import { CalendarPage } from './calendar-page';

export const CALENDAR_ROUTES: Routes = [
  { path: '', component: CalendarPage, providers: [providePrimeNgTheme()] },
];
