import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthStore } from './auth.store';

/**
 * Si la API responde 401 (sesión caducada o revocada), se olvida al usuario y se lleva al login.
 * Las propias llamadas de `/api/auth/` quedan fuera: ahí un 401 es una respuesta normal.
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
