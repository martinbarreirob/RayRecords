import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthStore } from './auth.store';

/** Sin sesión, al login recordando a dónde se quería ir. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthStore)
    .check()
    .pipe(
      map((ok) => ok || router.createUrlTree(['/login'], { queryParams: { volver: state.url } })),
    );
};
