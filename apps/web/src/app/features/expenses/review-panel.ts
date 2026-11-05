import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, type Observable } from 'rxjs';
import type { Category, ReviewGroup } from '@rayrecords/shared';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { isTypingTarget } from '../../core/palette/go-shortcuts';
import { FinanceStore } from './finance.store';
import { formatDay } from './movements-logic';
import {
  groupTitle,
  matchCategories,
  orderByUsage,
  shortcutLabel,
  mergeGroups,
  newCategoryFromQuery,
  progressPercent,
  sourceLabel,
  suggestionIndex,
} from './review-logic';

/** Cuántos grupos se piden de una vez y cuándo se pide más. */
const PAGE = 20;
const REFILL_BELOW = 4;

interface Decision {
  group: ReviewGroup;
  category: string;
  /** Regla que creó la decisión; llega cuando responde la API. */
  ruleId: string | null;
}

/**
 * Revisión de movimientos sin categoría, de uno en uno y con el teclado: se ve un comercio (con todos
 * sus movimientos), se pulsa 1–4 para una sugerencia o C para buscar, y pasa al siguiente.
 * Lo pendiente vive en la base de datos (es lo que no tiene categoría), así que no se pierde al salir.
 */
@Component({
  selector: 'app-review-panel',
  imports: [FormsModule],
  styleUrl: './review-panel.scss',
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <section class="review" aria-labelledby="rv-title">
      <header class="rv-head">
        <h2 id="rv-title">Revisar movimientos</h2>
        <p class="muted" aria-live="polite">
          @if (loaded()) {
            Quedan <strong class="num">{{ remaining() }}</strong> en
            <strong class="num">{{ groupsLeft() }}</strong>
            {{ groupsLeft() === 1 ? 'comercio' : 'comercios' }}
          }
        </p>
        <div
          class="rv-bar"
          role="progressbar"
          aria-label="Progreso de la revisión"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="percent()"
        >
          <span [style.width.%]="percent()"></span>
        </div>
      </header>

      @if (error(); as message) {
        <p class="alert" role="alert">
          {{ message }}
          <button type="button" class="btn sm" (click)="load()">Reintentar</button>
        </p>
      }

      @if (!loaded() && !error()) {
        <div class="card rv-card" aria-busy="true">
          <p class="sr-only" role="status">Cargando movimientos pendientes…</p>
          <span class="skeleton ghost-amount" aria-hidden="true"></span>
          <span class="skeleton ghost-title" aria-hidden="true"></span>
        </div>
      } @else if (current(); as g) {
        <article class="card rv-card" [class.is-income]="g.totalCents > 0">
          <p class="rv-meta muted">
            {{ g.count }} {{ g.count === 1 ? 'movimiento' : 'movimientos' }} ·
            {{ dateRange(g) }}
          </p>
          <p class="rv-amount num" [class.positive]="g.totalCents > 0">
            {{ money(g.totalCents) }}
          </p>
          <h3 class="rv-merchant">{{ title(g) }}</h3>
          <p class="rv-raw muted" [title]="g.sampleDescription">{{ g.sampleDescription }}</p>

          @if (g.count > 1) {
            <p class="rv-context muted">
              Importes: {{ recent(g) }}
              @if (g.count > 4) {
                …
              }
            </p>
          }

          <div class="rv-chips" role="group" aria-label="Categoría">
            @for (c of ordered(); track c.key; let i = $index) {
              <button type="button" class="rv-chip" [title]="c.name" (click)="choose(c.key)">
                <span class="dot" [style.background]="c.color" aria-hidden="true"></span>
                <span class="chip-name">{{ c.name }}</span>
                @if (shortcut(i); as key) {
                  <span class="kbd" aria-hidden="true">{{ key }}</span>
                }
              </button>
            }
          </div>
          @if (g.suggestions[0]; as best) {
            <p class="rv-hint muted">
              Sugerida: <strong>{{ name(best.category) }}</strong> · {{ why(best) }}
              <span class="kbd" aria-hidden="true">Intro</span>
            </p>
          }

          <div class="rv-search">
            <label for="rv-q" class="sr-only">Buscar otra categoría</label>
            <input
              #search
              id="rv-q"
              type="search"
              class="input"
              autocomplete="off"
              placeholder="Otra categoría… (tecla C)"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
              (keydown.enter)="chooseFirstMatch($event)"
              (keydown.escape)="clearSearch()"
            />
            @if (matches().length) {
              <ul class="rv-matches" role="listbox" aria-label="Categorías encontradas">
                @for (c of matches(); track c.key; let i = $index) {
                  <li>
                    <button
                      type="button"
                      class="rv-match"
                      [class.is-first]="i === 0"
                      (click)="choose(c.key)"
                    >
                      <span class="dot" [style.background]="c.color" aria-hidden="true"></span>
                      {{ c.name }}
                    </button>
                  </li>
                }
              </ul>
            }
            @if (newCategory(); as created) {
              <button type="button" class="rv-match rv-create" (click)="createAndChoose(created)">
                <i class="pi pi-plus" aria-hidden="true"></i>
                Crear categoría «{{ created.name }}» y usarla
                <span class="kbd" aria-hidden="true">Intro</span>
              </button>
            }
          </div>

          <footer class="rv-actions">
            <label
              class="rv-rule"
              title="Crea una regla para que los próximos extractos se clasifiquen solos"
            >
              <input type="checkbox" [(ngModel)]="createRule" />
              Recordar para el futuro <span class="kbd" aria-hidden="true">R</span>
            </label>
            <span class="spacer"></span>
            <button type="button" class="btn ghost" (click)="skip()" [disabled]="groupsLeft() < 2">
              Saltar <span class="kbd" aria-hidden="true">S</span>
            </button>
            <button type="button" class="btn ghost" (click)="undo()" [disabled]="!history().length">
              Deshacer <span class="kbd" aria-hidden="true">Z</span>
            </button>
          </footer>
        </article>
      } @else if (loaded()) {
        <div class="card empty" role="status">
          <p><strong>Todo revisado.</strong> No queda nada pendiente.</p>
          @if (history().length) {
            <button type="button" class="btn ghost" (click)="undo()">
              Deshacer la última <span class="kbd" aria-hidden="true">Z</span>
            </button>
          }
        </div>
      }

      @if (notice(); as text) {
        <p class="rv-toast" role="status" aria-live="polite">{{ text }}</p>
      }
    </section>
  `,
})
export class ReviewPanel implements OnInit, OnDestroy {
  private readonly api = inject(ApiClient);
  protected readonly store = inject(FinanceStore);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly groups = signal<ReviewGroup[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly query = signal('');
  private readonly creating = signal(false);
  protected createRule = true;

  /** Pendientes que quedan (se descuentan al decidir y se devuelven al deshacer) y los del inicio. */
  protected readonly remaining = signal(0);
  protected readonly groupsLeft = signal(0);
  private readonly initial = signal(0);
  protected readonly history = signal<Decision[]>([]);

  private inFlight = 0;
  private queue: Promise<void> = Promise.resolve();
  private loading = false;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly current = computed(() => this.groups()[0] ?? null);
  protected readonly percent = computed(() =>
    progressPercent(this.initial() - this.remaining(), this.initial()),
  );
  /** Todas las categorías de más a menos usada (fijado al abrir la revisión) y Otros la última. */
  private readonly usage = signal<{ category: string; count: number }[]>([]);
  protected readonly ordered = computed(() => orderByUsage(this.store.categories(), this.usage()));
  protected readonly newCategory = computed(() =>
    newCategoryFromQuery(this.query(), this.store.categories()),
  );
  private readonly colors = computed(
    () => new Map(this.store.categories().map((c) => [c.key, c.color])),
  );
  protected readonly matches = computed<Category[]>(() =>
    matchCategories(this.store.categories(), this.query()),
  );

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.noticeTimer);
    // El contador de la pestaña se refresca una sola vez, al salir, y no tras cada decisión.
    this.store.changed();
  }

  protected load(): void {
    if (this.loading) return;
    this.loading = true;
    this.api.reviewQueue(PAGE).subscribe({
      next: (queue) => {
        if (this.loaded()) {
          this.groups.update((current) => mergeGroups(current, queue.groups));
        } else {
          this.groups.set(queue.groups);
          this.remaining.set(queue.pendingTransactions);
          this.groupsLeft.set(queue.pendingGroups);
          this.initial.set(queue.pendingTransactions);
          this.usage.set(queue.usage);
          this.loaded.set(true);
        }
        this.error.set('');
        this.loading = false;
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading = false;
      },
    });
  }

  protected readonly money = formatCents;
  protected readonly title = groupTitle;
  protected readonly why = sourceLabel;

  protected name(key: string): string {
    return this.store.categoryName(key);
  }

  protected color(key: string): string | undefined {
    return this.colors().get(key);
  }

  protected readonly shortcut = shortcutLabel;

  protected dateRange(g: ReviewGroup): string {
    const year = new Date().getFullYear();
    return g.firstDate === g.lastDate
      ? formatDay(g.firstDate, year)
      : `${formatDay(g.firstDate, year)} – ${formatDay(g.lastDate, year)}`;
  }

  protected recent(g: ReviewGroup): string {
    return g.recentCents.map((c) => formatCents(c)).join(' · ');
  }

  /** Asigna la categoría al grupo actual y pasa al siguiente sin esperar al servidor. */
  protected choose(category: string): void {
    const group = this.current();
    if (!group) return;
    const decision: Decision = { group, category, ruleId: null };
    this.groups.update((list) => list.slice(1));
    this.remaining.update((n) => n - group.ids.length);
    this.groupsLeft.update((n) => n - 1);
    this.history.update((h) => [...h, decision]);
    this.clearSearch();

    this.track(
      () =>
        this.api.reviewApply({
          ids: group.ids,
          category,
          createRule: this.createRule,
        }),
      (result) => {
        decision.ruleId = result.ruleId;
        this.say(
          `${this.name(category)} · ${result.updated} ${result.updated === 1 ? 'movimiento' : 'movimientos'}` +
            (result.ruleId
              ? ' · regla creada'
              : result.ruleSkippedReason
                ? ` · sin regla: ${result.ruleSkippedReason.toLowerCase()}`
                : ''),
        );
      },
      () => this.revert(decision),
    );
  }

  /**
   * Lanza una petición en segundo plano. Van de una en una y en orden: deshacer no puede adelantarse a
   * la decisión que deshace. Los errores se muestran; `onError` revierte el cambio optimista.
   */
  private track<T>(request: () => Observable<T>, onOk: (result: T) => void, onError?: () => void) {
    this.inFlight++;
    this.queue = this.queue.then(async () => {
      try {
        onOk(await firstValueFrom(request()));
      } catch (error) {
        onError?.();
        this.error.set(apiErrorMessage(error));
      } finally {
        this.inFlight--;
        this.refillIfNeeded();
      }
    });
  }

  protected skip(): void {
    this.groups.update((list) => (list.length > 1 ? [...list.slice(1), list[0]!] : list));
    this.clearSearch();
  }

  protected undo(): void {
    const decision = this.history().at(-1);
    if (!decision) return;
    this.history.update((h) => h.slice(0, -1));
    this.revert(decision);
    this.track(
      () => this.api.reviewUndo({ ids: decision.group.ids, ruleId: decision.ruleId }),
      () => this.say('Deshecho'),
    );
  }

  /** Devuelve el grupo al principio de la cola y descuenta lo resuelto. */
  private revert(decision: Decision): void {
    this.groups.update((list) => [decision.group, ...list.filter((g) => g !== decision.group)]);
    this.remaining.update((n) => n + decision.group.ids.length);
    this.groupsLeft.update((n) => n + 1);
    this.history.update((h) => h.filter((d) => d !== decision));
  }

  private refillIfNeeded(): void {
    if (
      this.inFlight === 0 &&
      this.groups().length < REFILL_BELOW &&
      this.groupsLeft() > this.groups().length
    ) {
      this.load();
    }
  }

  protected chooseFirstMatch(event: Event): void {
    event.preventDefault();
    const first = this.matches()[0];
    const created = this.newCategory();
    if (first) this.choose(first.key);
    else if (created) this.createAndChoose(created);
  }

  /** Crea la categoría y, cuando existe en el servidor, se la asigna al grupo actual. */
  protected createAndChoose(created: { key: string; name: string }): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.api.createCategory(created).subscribe({
      next: (category) => {
        this.store.categories.update((list) => [...list, category]);
        this.creating.set(false);
        this.choose(category.key);
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  protected clearSearch(): void {
    this.query.set('');
    this.searchInput()?.nativeElement.blur();
  }

  private say(text: string): void {
    this.notice.set(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    const typing = isTypingTarget(event.target);
    if (event.ctrlKey && event.key.toLowerCase() === 'z' && !typing) {
      event.preventDefault();
      this.undo();
      return;
    }
    // `/` y Mayús+letra son atajos globales de la app (captura y navegación): no se tocan.
    if (event.ctrlKey || event.shiftKey || typing) return;

    // 1–9 son siempre las mismas categorías, en el orden en que se muestran.
    const index = suggestionIndex(event.key);
    if (index !== null) {
      const category = this.ordered()[index];
      if (category && this.current()) {
        event.preventDefault();
        this.choose(category.key);
      }
      return;
    }
    switch (event.key.toLowerCase()) {
      case 'enter': {
        const first = this.current()?.suggestions[0];
        if (first && target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
          event.preventDefault();
          this.choose(first.category);
        }
        break;
      }
      case 'c':
        event.preventDefault();
        this.searchInput()?.nativeElement.focus();
        break;
      case 's':
        this.skip();
        break;
      case 'z':
        this.undo();
        break;
      case 'r':
        this.createRule = !this.createRule;
        break;
    }
  }
}
