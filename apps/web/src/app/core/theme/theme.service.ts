import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/**
 * Light/dark theme. Every visit starts with the operating system's theme and follows it while the
 * user has not chosen; the toggle flips between light and dark for the rest of the visit. The
 * choice is deliberately not stored: the next visit starts from the system again.
 * It is applied as `data-theme` on <html>, which the tokens (styles/_tokens.scss) and PrimeNG read.
 * The script in theme-init.js applies the system theme before Angular boots to avoid a flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly systemDark = signal(false);
  /** The theme picked with the toggle, or null while the system's is in use. */
  private readonly chosen = signal<Theme | null>(null);

  /** Theme actually being shown. */
  readonly resolved = computed<Theme>(
    () => this.chosen() ?? (this.systemDark() ? 'dark' : 'light'),
  );

  /** Name of the theme being shown ("Claro" or "Oscuro"). */
  readonly label = computed(() => (this.resolved() === 'dark' ? 'Oscuro' : 'Claro'));

  constructor() {
    // `matchMedia` does not exist in jsdom (tests); it stays light there.
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemDark.set(query.matches);
      query.addEventListener('change', (event) => this.systemDark.set(event.matches));
    }

    effect(() => document.documentElement.setAttribute('data-theme', this.resolved()));
  }

  /** Light becomes dark and dark becomes light. */
  toggle(): void {
    this.chosen.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }
}
