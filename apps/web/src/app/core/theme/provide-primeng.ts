import {
  APP_INITIALIZER,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import { RayRecordsPreset } from './primeng-preset';

/**
 * PrimeNG configuration with our theme. It does NOT go in `app.config.ts`: it is declared in the
 * routes that use PrimeNG (lists, expenses, accounts), so the theme engine and the preset stay in
 * their lazy chunks and do not grow the initial bundle of the other screens.
 *
 * `providePrimeNG` registers its configuration as an app initializer, and those only run when the
 * app boots, not when a route injector is created. Without this step PrimeNG never gets the theme
 * and components render unstyled (transparent dialogs, shapeless dropdowns). Here the initializers
 * of this same injector run when the route is created; they are PrimeNG's own, unchanged.
 */
export function providePrimeNgTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([
    providePrimeNG({
      theme: {
        preset: RayRecordsPreset,
        options: { darkModeSelector: '[data-theme="dark"]', cssLayer: false },
      },
    }),
    provideEnvironmentInitializer(() => {
      const initializers = inject(APP_INITIALIZER, { self: true, optional: true }) ?? [];
      for (const initialize of initializers) void initialize();
    }),
  ]);
}
