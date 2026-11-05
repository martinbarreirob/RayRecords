import { Injectable, inject, signal } from '@angular/core';
import type { LoginInput, User } from '@rayrecords/shared';
import { catchError, map, of, tap, type Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';

/** Session state. The cookie is `httpOnly`, so the UI only learns who the user is by asking. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);

  readonly user = signal<User | null>(null);

  /** Is there a session? Once the user is known it does not ask the server again. */
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

  /** Forgets the user without telling the server (session expired or closed). */
  clear(): void {
    this.user.set(null);
  }
}
