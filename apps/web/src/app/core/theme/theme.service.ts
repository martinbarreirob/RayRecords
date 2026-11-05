import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'rr-theme';
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system'; // no storage (private mode, blocked data): follow the system
  }
}

/**
 * Light/dark theme. The preference is stored in the browser; "system" follows the operating system.
 * It is applied as `data-theme` on <html>, which the tokens (styles/_tokens.scss) and PrimeNG read.
 * The script in index.html applies the same before Angular boots to avoid a flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readPreference());
  private readonly systemDark = signal(false);

  /** Theme actually being shown. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference === 'system') return this.systemDark() ? 'dark' : 'light';
    return preference;
  });

  readonly label = computed(() => {
    switch (this.preference()) {
      case 'light':
        return 'Claro';
      case 'dark':
        return 'Oscuro';
      default:
        return 'Sistema';
    }
  });

  constructor() {
    // `matchMedia` does not exist in jsdom (tests); it stays light there.
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemDark.set(query.matches);
      query.addEventListener('change', (event) => this.systemDark.set(event.matches));
    }

    effect(() => document.documentElement.setAttribute('data-theme', this.resolved()));
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // No storage: the change only lasts for this session.
    }
  }

  /** System, light, dark, back to system. */
  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.preference()) + 1) % ORDER.length]!;
    this.set(next);
  }
}
