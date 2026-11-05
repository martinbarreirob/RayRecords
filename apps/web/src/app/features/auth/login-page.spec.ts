import { HttpErrorResponse } from '@angular/common/http';
import { loginErrorMessage } from './login-page';

describe('loginErrorMessage', () => {
  it('tells apart wrong credentials, rate limit and no connection', () => {
    expect(loginErrorMessage(new HttpErrorResponse({ status: 401 }))).toBe(
      'Usuario o contraseña incorrectos.',
    );
    expect(loginErrorMessage(new HttpErrorResponse({ status: 429 }))).toMatch(
      /Demasiados intentos/,
    );
    expect(loginErrorMessage(new HttpErrorResponse({ status: 0 }))).toMatch(/conectar/);
  });

  it('uses a generic message for the rest', () => {
    expect(loginErrorMessage(new HttpErrorResponse({ status: 500 }))).toMatch(/Inténtalo de nuevo/);
    expect(loginErrorMessage(new Error('x'))).toMatch(/Inténtalo de nuevo/);
  });
});
