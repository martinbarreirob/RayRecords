import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AccountSummary, Category } from '@rayrecords/shared';
import { forkJoin } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { NO_CATEGORY } from '../categories/uncategorized';

/** Accounts and categories, shared by the expenses and accounts screens. */
@Injectable({ providedIn: 'root' })
export class FinanceStore {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);

  readonly accounts = signal<AccountSummary[] | null>(null);
  readonly categories = signal<Category[]>([]);
  private readonly categoryByKey = computed(
    () => new Map(this.categories().map((c) => [c.key, c])),
  );
  readonly error = signal('');
  /** The category manager is open; any panel can ask for it, the expenses page hosts it. */
  readonly categoriesOpen = signal(false);
  /** The category the manager opens on (its key); `null` opens it on the first one. */
  readonly categoryToEdit = signal<string | null>(null);

  /** Opens the manager with a category already in its editor. */
  manageCategory(key: string): void {
    this.categoryToEdit.set(key);
    this.categoriesOpen.set(true);
  }

  /** Accounts and categories have loaded (or failed); before that, "no accounts" would be wrong. */
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
    if (key === null) return NO_CATEGORY;
    return this.categoryByKey().get(key)?.name ?? key;
  }

  /** The category a transaction or a rule points at, with its look; `null` if there is none. */
  category(key: string | null): Category | null {
    return key === null ? null : (this.categoryByKey().get(key) ?? null);
  }

  /** Tells every screen that the expenses data changed. */
  changed(): void {
    this.bus.changed();
  }
}
