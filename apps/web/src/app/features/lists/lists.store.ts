import { Injectable, computed, inject, signal } from '@angular/core';
import { DEFAULT_LIST_ALIASES, type List } from '@rayrecords/shared';
import { ApiClient } from '../../core/api/api-client';

/**
 * Estado de las listas, compartido por la pantalla de listas y por la captura rápida
 * (que necesita los alias de cada lista para interpretar `peli:`, `compra:`…).
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly api = inject(ApiClient);

  /** `null` mientras carga o si la API falló. */
  readonly lists = signal<List[] | null>(null);
  readonly failed = signal(false);

  /** Alias de captura de las listas; los de los presets mientras no haya datos. */
  readonly aliases = computed(
    () =>
      this.lists()?.flatMap((list) => (list.captureAlias ? [list.captureAlias] : [])) ??
      DEFAULT_LIST_ALIASES,
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.failed.set(false);
    this.api.lists().subscribe({
      next: (lists) => this.lists.set(lists),
      error: () => this.failed.set(true),
    });
  }
}
