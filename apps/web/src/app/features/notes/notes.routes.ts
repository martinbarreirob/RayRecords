import type { Routes } from '@angular/router';
import { NotesPage } from './notes-page';

export const NOTES_ROUTES: Routes = [
  { path: '', component: NotesPage }, // hoy
  { path: ':date', component: NotesPage }, // una fecha concreta (YYYY-MM-DD)
];
