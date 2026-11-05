import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from './api-client';
import { HttpApiClient } from './http-api-client';

/** `provideHttpClient` (con el interceptor de sesión) se declara en `app.config.ts`. */
export function provideApi(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ApiClient, useClass: HttpApiClient }]);
}
