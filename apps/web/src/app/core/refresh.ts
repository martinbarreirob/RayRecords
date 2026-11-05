import { Injectable, signal } from '@angular/core';

/**
 * Aviso de "los datos han cambiado" (p. ej. tras una captura rápida). Las pantallas abiertas leen
 * `version()` dentro de un `effect` y recargan lo suyo; así no se acoplan entre sí.
 */
@Injectable({ providedIn: 'root' })
export class RefreshBus {
  readonly version = signal(0);

  changed(): void {
    this.version.update((v) => v + 1);
  }
}
