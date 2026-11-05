import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_TIME_ZONE, monthOf, todayIn, type CalendarEntry } from '@rayrecords/shared';
import { SelectModule } from 'primeng/select';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { DateField } from '../../core/ui/date-field';
import { TimeField } from '../../core/ui/time-field';
import { ListsStore } from '../lists/lists.store';
import {
  arrowTarget,
  buildMonthGrid,
  dayParts,
  dayTitle,
  defaultSelection,
  ghostPills,
  groupByDate,
  isOverdueEntry,
  monthTitle,
  rangeKey,
  shiftMonth,
  sortDayEntries,
  splitVisible,
} from './calendar-grid';

type CalendarView = 'month' | 'agenda';

/** Items that fit in a grid cell before "+n más". */
const CELL_LIMIT = 3;
const NARROW_QUERY = '(max-width: 767px)';
const GRID_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

@Component({
  selector: 'app-calendar-page',
  imports: [RouterLink, NgTemplateOutlet, FormsModule, SelectModule, DateField, TimeField],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="title">
          <h1>Calendario</h1>
          <span class="page-eyebrow" aria-live="polite">{{ monthLabel() }}</span>
        </div>

        <div class="tools">
          <div class="row nav" role="group" aria-label="Cambiar de mes">
            <button type="button" class="btn icon" aria-label="Mes anterior" (click)="go(-1)">
              <i class="pi pi-chevron-left" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn" (click)="goToday()">Hoy</button>
            <button type="button" class="btn icon" aria-label="Mes siguiente" (click)="go(1)">
              <i class="pi pi-chevron-right" aria-hidden="true"></i>
            </button>
          </div>

          <div class="segmented" role="group" aria-label="Vista">
            <button
              type="button"
              [attr.aria-pressed]="view() === 'month'"
              (click)="setView('month')"
            >
              Mes
            </button>
            <button
              type="button"
              [attr.aria-pressed]="view() === 'agenda'"
              (click)="setView('agenda')"
            >
              Agenda
            </button>
          </div>

          <button type="button" class="btn primary" (click)="openAdd(selected())">
            <i class="pi pi-plus" aria-hidden="true"></i>
            Añadir
          </button>
        </div>
      </header>

      <p class="sr-only" role="status">{{ loading() ? 'Cargando el calendario…' : '' }}</p>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      @if (adding()) {
        <form class="card add" (submit)="add($event)" (keydown.escape)="adding.set(false)">
          <label class="field title-field">
            <span>Título</span>
            <input
              #titleInput
              class="input"
              type="text"
              name="title"
              autocomplete="off"
              placeholder="Qué hay que hacer"
              [value]="newTitle()"
              (input)="newTitle.set(titleInput.value)"
            />
          </label>
          <div class="field">
            <label for="cal-date">Fecha</label>
            <app-date-field inputId="cal-date" [required]="true" [(value)]="newDate" />
          </div>
          <div class="field">
            <label for="cal-time">Hora (opcional)</label>
            <app-time-field inputId="cal-time" [(value)]="newTime" />
          </div>
          <label class="field list-field">
            <span>Lista</span>
            <p-select
              [options]="lists()"
              optionLabel="name"
              optionValue="id"
              [ngModel]="effectiveListId()"
              [ngModelOptions]="{ standalone: true }"
              (onChange)="listId.set($event.value ?? '')"
              ariaLabel="Lista"
              appendTo="body"
              styleClass="w-full"
            />
          </label>
          <div class="row actions">
            <button type="button" class="btn ghost" (click)="adding.set(false)">Cancelar</button>
            <button
              type="submit"
              class="btn primary"
              [disabled]="!newTitle().trim() || !newDate() || !effectiveListId()"
            >
              Añadir
            </button>
          </div>
          @if (!lists().length) {
            <p class="muted hint">
              Aún no hay listas: <a routerLink="/listas">crea una</a> para poder añadir elementos.
            </p>
          }
        </form>
      }

      @if (view() === 'month') {
        <div class="month-layout">
          <section
            class="card grid-card"
            aria-label="Mes"
            [class.is-refreshing]="refreshing()"
            [attr.aria-busy]="loading()"
          >
            <table class="grid" (keydown)="onGridKeydown($event)">
              <caption class="sr-only">
                {{
                  monthLabel()
                }}
              </caption>
              <thead>
                <tr>
                  @for (day of weekdays; track day) {
                    <th scope="col">{{ day }}</th>
                  }
                </tr>
              </thead>
              @if (loading()) {
                <tbody class="skel-in" aria-hidden="true">
                  @for (week of weeks(); track week[0].date; let w = $index) {
                    <tr>
                      @for (day of week; track day.date; let d = $index) {
                        <td [class.outside]="!day.inMonth">
                          <span class="num"><span class="skeleton circle"></span></span>
                          <ul class="chips">
                            @for (width of pills(w * 7 + d); track $index) {
                              <li class="skeleton ghost-chip" [style.width.%]="width"></li>
                            }
                          </ul>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              } @else {
                <tbody>
                  @for (week of weeks(); track week[0].date) {
                    <tr>
                      @for (day of week; track day.date) {
                        <td
                          [class.outside]="!day.inMonth"
                          [class.today]="day.date === today"
                          [class.selected]="day.date === selected()"
                        >
                          <button
                            type="button"
                            class="day"
                            [attr.data-date]="day.date"
                            [attr.tabindex]="day.date === selected() ? 0 : -1"
                            [attr.aria-label]="dayLabel(day.date, day.total)"
                            [attr.aria-pressed]="day.date === selected()"
                            [attr.aria-current]="day.date === today ? 'date' : null"
                            (click)="selected.set(day.date)"
                          >
                            <span class="num">{{ dayNumber(day.date) }}</span>
                          </button>
                          <span class="dots" aria-hidden="true">
                            @for (entry of day.shown; track entry.id) {
                              <i [class.done]="entry.doneAt" [class.overdue]="isOverdue(entry)"></i>
                            }
                          </span>
                          <ul class="chips">
                            @for (entry of day.shown; track entry.id) {
                              <li
                                class="entry"
                                [class.done]="entry.doneAt"
                                [class.overdue]="isOverdue(entry)"
                              >
                                @if (entry.time) {
                                  <span class="time">{{ entry.time }}</span>
                                }
                                <span class="t">{{ entry.title }}</span>
                              </li>
                            }
                            @if (day.more) {
                              <li class="more">+{{ day.more }} más</li>
                            }
                          </ul>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              }
            </table>
          </section>

          <aside
            class="card day-panel"
            aria-label="Detalle del día"
            [class.is-refreshing]="refreshing()"
            [attr.aria-busy]="loading()"
          >
            <div class="day-head">
              <h2>{{ selectedLabel() }}</h2>
              @if (selected() === today) {
                <span class="badge accent">Hoy</span>
              }
            </div>
            @if (loading()) {
              <ul class="rows skel-in" aria-hidden="true">
                @for (n of ghostRows; track n) {
                  <ng-container *ngTemplateOutlet="ghostRow" />
                }
              </ul>
            } @else if (selectedEntries().length) {
              <ul class="rows">
                @for (entry of selectedEntries(); track entry.id) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
                }
              </ul>
            } @else {
              <p class="empty">No hay nada este día.</p>
            }
            <button type="button" class="btn sm add-here" (click)="openAdd(selected())">
              <i class="pi pi-plus" aria-hidden="true"></i>
              Añadir en este día
            </button>
          </aside>
        </div>
      } @else {
        <section
          class="agenda"
          aria-label="Agenda"
          [class.is-refreshing]="refreshing()"
          [attr.aria-busy]="loading()"
        >
          @if (loading()) {
            @for (count of ghostAgenda; track $index) {
              <article class="card agenda-day skel-in" aria-hidden="true">
                <div class="agenda-date">
                  <span class="skeleton ghost-wd"></span>
                  <span class="skeleton ghost-dn"></span>
                </div>
                <div class="agenda-body">
                  <ul class="rows">
                    @for (n of ghostRows.slice(0, count); track n) {
                      <ng-container *ngTemplateOutlet="ghostRow" />
                    }
                  </ul>
                </div>
              </article>
            }
          } @else {
            @for (group of agenda(); track group.date) {
              <article class="card agenda-day" [class.today]="group.date === today">
                <div class="agenda-date" aria-hidden="true">
                  <span class="wd">{{ group.weekday }}</span>
                  <span class="dn">{{ group.day }}</span>
                </div>
                <div class="agenda-body">
                  <h2 class="sr-only">{{ group.title }}</h2>
                  <ul class="rows">
                    @for (entry of group.entries; track entry.id) {
                      <ng-container *ngTemplateOutlet="row; context: { $implicit: entry }" />
                    }
                  </ul>
                </div>
              </article>
            } @empty {
              <p class="empty">
                No hay nada con fecha en {{ monthLabel() }}. Pulsa «Añadir» para crear un elemento.
              </p>
            }
          }
        </section>
      }
    </div>

    <ng-template #ghostRow>
      <li class="row-entry">
        <span class="skeleton circle ghost-check"></span>
        <div class="body">
          <span class="ghost-line"><span class="skeleton ghost-title"></span></span>
          <span class="ghost-line small"><span class="skeleton ghost-list"></span></span>
        </div>
      </li>
    </ng-template>

    <ng-template #row let-entry>
      <li class="row-entry" [class.done]="entry.doneAt" [class.overdue]="isOverdue(entry)">
        <input
          #check
          type="checkbox"
          class="check"
          [attr.aria-label]="'Hecho: ' + entry.title"
          [checked]="!!entry.doneAt"
          (change)="toggleDone(entry, check.checked)"
        />
        <div class="body">
          <div class="line">
            @if (entry.time) {
              <span class="time">{{ entry.time }}</span>
            }
            <span class="t">{{ entry.title }}</span>
            @if (isOverdue(entry)) {
              <span class="badge danger">Vencida</span>
            }
          </div>
          <a class="list-link" [routerLink]="['/listas', entry.listSlug]">{{ entry.listName }}</a>
        </div>
      </li>
    </ng-template>
  `,
  styleUrls: ['./calendar-page.scss', './calendar-skeleton.scss'],
})
export class CalendarPage {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  private readonly listsStore = inject(ListsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  protected readonly today = todayIn(DEFAULT_TIME_ZONE);

  protected readonly month = signal(monthOf(this.today));
  protected readonly selected = signal(this.today);
  protected readonly error = signal('');

  /** Items already loaded per requested range: going back to a seen month does not empty the screen. */
  private readonly cache = signal<ReadonlyMap<string, CalendarEntry[]>>(new Map());
  /** Range whose request failed (so it does not stay "loading" forever). */
  private readonly failedKey = signal('');
  /** Range with a request in flight. */
  private readonly pendingKey = signal('');

  protected readonly ghostRows = [0, 1];
  protected readonly ghostAgenda = [2, 1, 2];
  protected readonly pills = ghostPills;

  /** On narrow screens it starts on the agenda (easier with a finger); the grid is one tap away. */
  protected readonly view = signal<CalendarView>(
    typeof matchMedia === 'function' && matchMedia(NARROW_QUERY)?.matches ? 'agenda' : 'month',
  );

  protected readonly adding = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newDate = signal('');
  protected readonly newTime = signal('');
  protected readonly listId = signal('');
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly lists = computed(() => this.listsStore.lists() ?? []);
  protected readonly effectiveListId = computed(() => this.listId() || this.lists()[0]?.id || '');

  protected readonly grid = computed(() => buildMonthGrid(this.month()));
  private readonly key = computed(() => rangeKey(this.grid()));

  private readonly entries = computed(() => this.cache().get(this.key()) ?? []);

  /** No data for this month yet (first load or unvisited month): the skeleton is drawn, not "empty". */
  protected readonly loading = computed(
    () => !this.cache().has(this.key()) && this.failedKey() !== this.key(),
  );

  /** There is data for the month and it is being refreshed: shown dimmed. */
  protected readonly refreshing = computed(
    () => this.pendingKey() === this.key() && this.cache().has(this.key()),
  );
  protected readonly monthLabel = computed(() => monthTitle(this.month()));
  protected readonly selectedLabel = computed(() => dayTitle(this.selected()));

  private readonly byDate = computed(() => {
    const groups = groupByDate(this.entries());
    for (const [date, group] of groups) groups.set(date, sortDayEntries(group));
    return groups;
  });

  /** Weeks with what is drawn in each cell. */
  protected readonly weeks = computed(() =>
    this.grid().map((week) =>
      week.map((day) => {
        const all = this.byDate().get(day.date) ?? [];
        return { ...day, ...splitVisible(all, CELL_LIMIT), total: all.length };
      }),
    ),
  );

  protected readonly selectedEntries = computed(() => this.byDate().get(this.selected()) ?? []);

  /** Days with items in the shown month, in order. */
  protected readonly agenda = computed(() => {
    const month = this.month();
    return [...this.byDate()]
      .filter(([date]) => date.startsWith(month))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, entries]) => ({ date, entries, title: dayTitle(date), ...dayParts(date) }));
  });

  constructor() {
    effect(() => {
      const weeks = this.grid();
      this.bus.version();
      const from = weeks[0]![0]!.date;
      const to = weeks.at(-1)!.at(-1)!.date;
      untracked(() => this.load(from, to));
    });

    // When the form opens, focus goes to the title.
    effect(() => {
      const input = this.titleInput();
      if (input) untracked(() => input.nativeElement.focus());
    });
  }

  private load(from: string, to: string): void {
    const key = `${from}..${to}`;
    this.pendingKey.set(key);
    this.api.calendar(from, to).subscribe({
      next: (entries) => {
        this.cache.update((cache) => new Map(cache).set(key, entries));
        this.failedKey.update((failed) => (failed === key ? '' : failed));
        if (this.pendingKey() === key) this.pendingKey.set('');
        this.error.set('');
      },
      error: (error: unknown) => {
        this.failedKey.set(key);
        if (this.pendingKey() === key) this.pendingKey.set('');
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  protected setView(view: CalendarView): void {
    this.view.set(view);
  }

  /** Keyboard in the grid: arrows (day and week), Home and End (Monday and Sunday of the week). */
  protected onGridKeydown(event: KeyboardEvent): void {
    if (!GRID_KEYS.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-date]');
    if (!target?.dataset['date']) return;
    event.preventDefault();
    const date = arrowTarget(target.dataset['date'], event.key);
    this.month.set(monthOf(date));
    this.selected.set(date);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  protected dayNumber(date: string): number {
    return Number(date.slice(8));
  }

  protected dayLabel(date: string, total: number): string {
    const count = total === 0 ? 'sin elementos' : total === 1 ? '1 elemento' : `${total} elementos`;
    return `${dayTitle(date)}, ${count}`;
  }

  protected isOverdue(entry: CalendarEntry): boolean {
    return isOverdueEntry(entry, this.today);
  }

  protected go(delta: number): void {
    const month = shiftMonth(this.month(), delta);
    this.month.set(month);
    this.selected.set(defaultSelection(month, this.today));
  }

  protected goToday(): void {
    this.month.set(monthOf(this.today));
    this.selected.set(this.today);
  }

  protected openAdd(date: string): void {
    this.newDate.set(date);
    this.adding.set(true);
  }

  protected add(event: Event): void {
    event.preventDefault();
    const title = this.newTitle().trim();
    const listId = this.effectiveListId();
    const date = this.newDate();
    if (!title || !listId || !date) return;
    this.api
      .createItem({
        listId,
        title,
        dueDate: date,
        ...(this.newTime() && { time: this.newTime() }),
        tags: [],
        extra: {},
        source: 'manual',
      })
      .subscribe({
        next: () => {
          this.newTitle.set('');
          this.newTime.set('');
          this.error.set('');
          // Shows the day where the item ended up.
          this.month.set(monthOf(date));
          this.selected.set(date);
          this.titleInput()?.nativeElement.focus();
          this.bus.changed();
        },
        error: (error: unknown) => this.error.set(apiErrorMessage(error)),
      });
  }

  protected toggleDone(entry: CalendarEntry, done: boolean): void {
    this.api.updateItem(entry.id, { done }).subscribe({
      next: () => this.bus.changed(),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }
}
