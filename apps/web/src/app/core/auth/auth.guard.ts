import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthStore } from './auth.store';

/** Without a session, redirects to login and remembers where the user was going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthStore)
    .check()
    .pipe(
      map((ok) => ok || router.createUrlTree(['/login'], { queryParams: { volver: state.url } })),
    );
};
