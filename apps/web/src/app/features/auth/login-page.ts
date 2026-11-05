import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

/** Internal paths only: keeps `?volver=` from working as an open redirect. */
export function safeReturnUrl(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/** Text for a login failure: says what happened and, if possible, what to do. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'Usuario o contraseña incorrectos.';
    if (error.status === 429) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    if (error.status === 0) return 'No se puede conectar con el servidor. Revisa tu conexión.';
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

@Component({
  selector: 'app-login-page',
  template: `
    <div class="login">
      <p class="brand" aria-hidden="true">
        <img class="logo" src="logo.svg" alt="" width="40" height="40" />RayRecords
      </p>

      <form class="card" (submit)="submit($event)" novalidate>
        <h1>Iniciar sesión</h1>

        <label class="field">
          <span>Usuario</span>
          <input
            #user
            class="input"
            name="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            enterkeyhint="next"
            spellcheck="false"
            required
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [value]="username()"
            (input)="username.set(user.value)"
          />
        </label>

        <label class="field">
          <span>Contraseña</span>
          <span class="pass">
            <input
              #pass
              class="input"
              name="password"
              [type]="showPassword() ? 'text' : 'password'"
              autocomplete="current-password"
              enterkeyhint="go"
              required
              [attr.aria-invalid]="error() ? 'true' : null"
              [attr.aria-describedby]="error() ? 'login-error' : null"
              [value]="password()"
              (input)="password.set(pass.value)"
            />
            <button
              type="button"
              class="reveal"
              [attr.aria-label]="showPassword() ? 'Ocultar la contraseña' : 'Mostrar la contraseña'"
              [attr.aria-pressed]="showPassword()"
              (click)="showPassword.set(!showPassword())"
            >
              <i
                class="pi"
                [class.pi-eye]="!showPassword()"
                [class.pi-eye-slash]="showPassword()"
                aria-hidden="true"
              ></i>
            </button>
          </span>
        </label>

        @if (error(); as message) {
          <p id="login-error" class="alert" role="alert">{{ message }}</p>
        }

        <button type="submit" class="btn primary" [disabled]="busy()" [attr.aria-busy]="busy()">
          @if (busy()) {
            <i class="pi pi-spinner pi-spin" aria-hidden="true"></i> Entrando…
          } @else {
            Entrar
          }
        </button>
      </form>
    </div>
  `,
  styles: `
    .login {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-5);
      min-height: 100vh;
      min-height: 100dvh;
      padding: var(--space-6) var(--space-4);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-lg);
      font-weight: 600;
    }

    .logo {
      flex: none;
      width: 40px;
      height: 40px;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 380px;
      padding: var(--space-5);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-md);
    }

    h1 {
      font-size: var(--text-xl);
    }

    .btn {
      width: 100%;
      min-height: var(--touch-target);
    }

    .input {
      min-height: var(--touch-target);
    }

    .input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    /* Password with a show button: the field leaves room on the right. */
    .pass {
      position: relative;
      display: block;
    }

    .pass .input {
      padding-right: var(--touch-target);
    }

    .reveal {
      position: absolute;
      top: 0;
      right: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: 100%;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }

    .reveal:hover {
      color: var(--text);
    }

    .alert {
      margin: 0;
    }

    @media (width <= 767px) {
      .login {
        justify-content: flex-start;
        padding-top: var(--space-7);
      }

      form {
        padding: var(--space-4);
      }
    }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Path to return to after login (`?volver=` param, bound by the router). */
  readonly volver = input<string>();

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly showPassword = signal(false);
  private readonly userInput = viewChild<ElementRef<HTMLInputElement>>('user');
  private readonly passInput = viewChild<ElementRef<HTMLInputElement>>('pass');

  constructor() {
    // Initial focus goes to the username (the `autofocus` attribute does not work on in-app navigation).
    effect(() => this.userInput()?.nativeElement.focus());
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;

    // Fields are read as they are: a password manager may fill them without firing `input`.
    const username = (this.userInput()?.nativeElement.value ?? this.username()).trim();
    const password = this.passInput()?.nativeElement.value ?? this.password();
    if (!username || !password) {
      this.error.set(username ? 'Escribe la contraseña.' : 'Escribe tu usuario y tu contraseña.');
      (username ? this.passInput() : this.userInput())?.nativeElement.focus();
      return;
    }

    this.busy.set(true);
    this.error.set('');

    this.auth.login({ username, password }).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.volver())),
      error: (error: unknown) => {
        this.password.set('');
        this.error.set(loginErrorMessage(error));
        this.busy.set(false);
        // Focus goes back to the now-empty password to retry.
        queueMicrotask(() => {
          const field = this.passInput()?.nativeElement;
          if (field) field.value = '';
          field?.focus();
        });
      },
    });
  }
}
