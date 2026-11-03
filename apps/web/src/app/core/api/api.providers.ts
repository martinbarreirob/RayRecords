import { provideHttpClient, withFetch } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from './api-client';
import { HttpApiClient } from './http-api-client';

export function provideApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch()),
    { provide: ApiClient, useClass: HttpApiClient },
  ]);
}
