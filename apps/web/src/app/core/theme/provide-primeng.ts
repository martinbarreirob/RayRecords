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
 * Configuración de PrimeNG con nuestro tema. NO va en `app.config.ts`: se declara en las rutas que
 * usan PrimeNG (listas, gastos, cuentas), así el motor de temas y el preset quedan en sus chunks
 * diferidos y no engordan el bundle inicial de las demás pantallas.
 *
 * `providePrimeNG` registra su configuración como inicializador de aplicación, y esos solo se ejecutan
 * al arrancar la app, no al crear el inyector de una ruta. Sin ese paso PrimeNG no recibe el tema y los
 * componentes salen sin estilo (diálogos transparentes, desplegables sin forma). Aquí se ejecutan los
 * inicializadores de este mismo inyector al crearse la ruta; son los de PrimeNG, tal cual.
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
