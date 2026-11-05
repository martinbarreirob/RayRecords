import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthStore } from './auth.store';

/**
 * If the API answers 401 (expired or revoked session), the user is forgotten and sent to login.
 * Calls to `/api/auth/` are excluded: a 401 there is a normal answer.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return next(req).pipe(
    tap({
      error: (error: { status?: number }) => {
        if (error.status !== 401 || req.url.startsWith('/api/auth/')) return;
        auth.clear();
        void router.navigate(['/login'], { queryParams: { volver: router.url } });
      },
    }),
  );
};
