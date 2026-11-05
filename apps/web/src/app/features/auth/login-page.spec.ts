import { HttpErrorResponse } from '@angular/common/http';
import { loginErrorMessage } from './login-page';

describe('loginErrorMessage', () => {
  it('distingue credenciales incorrectas, límite de intentos y falta de conexión', () => {
    expect(loginErrorMessage(new HttpErrorResponse({ status: 401 }))).toBe(
      'Usuario o contraseña incorrectos.',
    );
    expect(loginErrorMessage(new HttpErrorResponse({ status: 429 }))).toMatch(
      /Demasiados intentos/,
    );
    expect(loginErrorMessage(new HttpErrorResponse({ status: 0 }))).toMatch(/conectar/);
  });

  it('usa un mensaje genérico para el resto', () => {
    expect(loginErrorMessage(new HttpErrorResponse({ status: 500 }))).toMatch(/Inténtalo de nuevo/);
    expect(loginErrorMessage(new Error('x'))).toMatch(/Inténtalo de nuevo/);
  });
});
