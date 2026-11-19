import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import type { ThemePreference } from '@rayrecords/shared';
import { ApiClient } from '../api/api-client';
import { AuthStore } from '../auth/auth.store';

export type Theme = 'light' | 'dark';

/** Where this browser remembers the last known preference (see `theme-init.js`). */
export const THEME_CACHE_KEY = 'rayrecords.theme';

/**
 * Light/dark theme. The default is the light one. Picking a theme saves it in the user's account,
 * so it comes back on every device. "system" (follow the device live) is no longer offered, but accounts that saved it keep working.
 *
 * The account is the source of truth. The browser also keeps a copy, only so that
 * `theme-init.js` can paint the right theme before Angular boots and before the session is
 * known; it is corrected as soon as the user arrives.
 *
 * The theme is applied as `data-theme` on <html>, which the tokens (styles/_tokens.scss) and
 * PrimeNG read.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);

  private readonly systemDark = signal(false);
  /** What the user wants: the system's theme or a fixed one. */
  readonly preference = signal<ThemePreference>(readCache());

  /** Theme actually being shown. */
  readonly resolved = computed<Theme>(() => {
    const preference = this.preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  /** Name of the theme being shown ("Claro" or "Oscuro"). */
  readonly label = computed(() => (this.resolved() === 'dark' ? 'Oscuro' : 'Claro'));

  constructor() {
    // `matchMedia` does not exist in jsdom (tests); it stays light there.
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemDark.set(query.matches);
      query.addEventListener('change', (event) => this.systemDark.set(event.matches));
    }

    // The account decides: when the user arrives (login or an existing session), use its theme.
    effect(() => {
      const user = this.auth.user();
      if (user) untracked(() => this.apply(user.theme ?? 'light'));
    });

    effect(() => document.documentElement.setAttribute('data-theme', this.resolved()));
  }

  /** Light becomes dark and dark becomes light; the choice is saved. */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  /** Picks a theme (or "system") and saves it in the account when there is a session. */
  set(preference: ThemePreference): void {
    this.apply(preference);
    const user = this.auth.user();
    if (!user || user.theme === preference) return;
    // Shown at once; if saving fails the theme stays for this visit and the account keeps its own.
    this.injector
      .get(ApiClient)
      .updateMe({ theme: preference })
      .subscribe({
        next: (saved) => this.auth.user.set(saved),
        error: () => undefined,
      });
  }

  private apply(preference: ThemePreference): void {
    this.preference.set(preference);
    writeCache(preference);
  }
}

function readCache(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_CACHE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

/** The last preference this browser saw, so the first paint matches it. */
function writeCache(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, preference);
  } catch {
    // Private mode or blocked storage: the account still remembers it.
  }
}
