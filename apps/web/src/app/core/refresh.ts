import { Injectable, signal } from '@angular/core';

/**
 * "Data changed" notice (e.g. after a quick capture). Open screens read `version()` inside an
 * `effect` and reload their own data, so they are not coupled to each other.
 */
@Injectable({ providedIn: 'root' })
export class RefreshBus {
  readonly version = signal(0);

  changed(): void {
    this.version.update((v) => v + 1);
  }
}
