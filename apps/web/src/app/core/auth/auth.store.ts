import { Injectable, inject, signal } from '@angular/core';
import type { LoginInput, User } from '@rayrecords/shared';
import { catchError, map, of, tap, type Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';

/** Estado de la sesión. La cookie es `httpOnly`: la UI solo sabe quién es el usuario preguntándolo. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);

  readonly user = signal<User | null>(null);

  /** ¿Hay sesión? Con el usuario ya conocido no vuelve a preguntar al servidor. */
  check(): Observable<boolean> {
    if (this.user()) return of(true);
    return this.api.me().pipe(
      tap((user) => this.user.set(user)),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  login(input: LoginInput): Observable<User> {
    return this.api.login(input).pipe(tap((user) => this.user.set(user)));
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(tap({ finalize: () => this.clear() }));
  }

  /** Olvida al usuario sin avisar al servidor (sesión caducada o cerrada). */
  clear(): void {
    this.user.set(null);
  }
}
