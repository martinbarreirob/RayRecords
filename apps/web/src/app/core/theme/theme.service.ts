import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'rr-theme';
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system'; // sin almacenamiento (modo privado, datos bloqueados): se sigue al sistema
  }
}

/**
 * Tema claro/oscuro. La preferencia se guarda en el navegador; «system» sigue al sistema operativo.
 * Se aplica como `data-theme` en <html>, que es lo que leen los tokens (styles/_tokens.scss) y PrimeNG.
 * El script de index.html aplica lo mismo antes de arrancar Angular para que no haya parpadeo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(readPreference());
  private readonly systemDark = signal(false);

  /** Tema que se está mostrando de verdad. */
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
    // `matchMedia` no existe en jsdom (tests); allí se queda en claro.
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
      // Sin almacenamiento: el cambio vale solo para esta sesión.
    }
  }

  /** Sistema → claro → oscuro → sistema. */
  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.preference()) + 1) % ORDER.length]!;
    this.set(next);
  }
}
