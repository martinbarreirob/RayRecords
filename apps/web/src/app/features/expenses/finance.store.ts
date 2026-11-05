import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AccountSummary, Category } from '@rayrecords/shared';
import { forkJoin } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';

/** Cuentas y categorías, compartidas por las pantallas de gastos y de cuentas. */
@Injectable({ providedIn: 'root' })
export class FinanceStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  readonly accounts = signal<AccountSummary[] | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly error = signal('');

  /** Ya llegaron cuentas y categorías (o falló): antes de eso «no hay cuentas» sería mentira. */
  readonly ready = computed(() => this.accounts() !== null || this.error() !== '');

  constructor() {
    effect(() => {
      this.bus.version();
      this.load();
    });
  }

  load(): void {
    forkJoin({ accounts: this.api.accounts(), categories: this.api.categories() }).subscribe({
      next: ({ accounts, categories }) => {
        this.accounts.set(accounts);
        this.categories.set(categories);
        this.error.set('');
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  categoryName(key: string | null): string {
    if (key === null) return 'Sin categoría';
    return this.categories().find((c) => c.key === key)?.name ?? key;
  }

  /** Avisa a todas las pantallas de que los datos de gastos cambiaron. */
  changed(): void {
    this.bus.changed();
  }
}
