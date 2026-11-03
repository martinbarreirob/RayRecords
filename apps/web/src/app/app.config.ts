import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideApi } from './core/api/api.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Los parámetros de ruta (`:slug`, `:date`) llegan a los componentes como `input()`.
    provideRouter(routes, withComponentInputBinding()),
    provideApi(),
  ],
};
