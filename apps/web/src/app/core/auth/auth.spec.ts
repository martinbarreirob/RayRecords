import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { safeReturnUrl } from '../../features/auth/login-page';
import { authGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

const USER = { id: 'a'.repeat(24), username: 'martin' };

function setup(api: Partial<ApiClient>) {
  TestBed.configureTestingModule({
    providers: [{ provide: ApiClient, useValue: api }],
  });
  return { auth: TestBed.inject(AuthStore), router: TestBed.inject(Router) };
}

describe('authGuard', () => {
  const run = () =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/gastos' } as RouterStateSnapshot),
    );

  it('lets a valid session through', async () => {
    setup({ me: () => of(USER) });
    expect(await firstValueFrom(run() as never)).toBe(true);
  });

  it('without a session redirects to login and remembers the route', async () => {
    const { router } = setup({
      me: () => throwError(() => new HttpErrorResponse({ status: 401 })),
    });
    const result = (await firstValueFrom(run() as never)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result)).toBe('/login?volver=%2Fgastos');
  });

  it('with a known user it does not ask the server again', async () => {
    let calls = 0;
    const { auth } = setup({
      me: () => {
        calls++;
        return of(USER);
      },
    });
    auth.user.set(USER);
    await firstValueFrom(run() as never);
    expect(calls).toBe(0);
  });
});

describe('authInterceptor', () => {
  function intercept(url: string, status: number) {
    const { auth, router } = setup({});
    auth.user.set(USER);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const next = () =>
      status === 200
        ? of(new HttpResponse({ status }))
        : throwError(() => new HttpErrorResponse({ status, url }));

    TestBed.runInInjectionContext(() =>
      authInterceptor(new HttpRequest('GET', url), next).subscribe({ error: () => undefined }),
    );
    return { auth, navigate };
  }

  it('a 401 from the API forgets the user and goes to login', () => {
    const { auth, navigate } = intercept('/api/lists', 401);
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('a 401 from /api/auth/ does not redirect (it is a normal answer)', () => {
    const { auth, navigate } = intercept('/api/auth/login', 401);
    expect(auth.user()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('other errors leave the session alone', () => {
    const { auth, navigate } = intercept('/api/lists', 500);
    expect(auth.user()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('safeReturnUrl', () => {
  it('accepts internal paths only', () => {
    expect(safeReturnUrl('/gastos?mes=2026-11')).toBe('/gastos?mes=2026-11');
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
  });
});
