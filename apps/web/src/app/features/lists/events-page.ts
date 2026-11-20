import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_TIME_ZONE,
  EVENTS_LIST_NAME,
  todayIn,
  type CalendarEvent,
} from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { AddButton } from '../../core/ui/add-button';
import { Icon } from '../../core/ui/icon';
import { EventDialog } from '../calendar/event-dialog';
import { formatDay } from '../expenses/movements-logic';
import { eventsCountText, filterEvents, sortEvents } from './events-logic';

/** What the dialog needs of an event it edits. */
interface EditedEvent {
  id: string;
  title: string;
  dueDate: string;
  time?: string;
}

/**
 * The locked «Eventos» list: every event of the calendar in one place, to look up, add, edit and
 * delete. It is a view over the same events the calendar draws, so a change here shows there.
 */
@Component({
  selector: 'app-events-page',
  imports: [RouterLink, FormsModule, ConfirmDialogModule, EventDialog, AddButton, Icon],
  providers: [ConfirmationService],
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-5);
      min-height: var(--control-height);
      margin-bottom: var(--space-5);
    }

    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) 10px;
      min-width: 0;
    }

    .crumb,
    .crumb a {
      color: var(--muted);
      font-size: var(--text-base);
    }

    h1 {
      overflow-wrap: anywhere;
      font-size: var(--text-xl);
    }

    .summary {
      margin-left: var(--space-2);
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .toolbar {
      margin-bottom: var(--space-4);
    }

    .search {
      width: min(320px, 100%);
    }

    .card {
      overflow: hidden;
    }

    .c-check {
      width: 44px;
    }

    .c-when {
      width: 1%;
      color: var(--muted);
      white-space: nowrap;
    }

    .c-actions {
      width: 1%;
      white-space: nowrap;
      text-align: right;
    }

    .done .t {
      color: var(--muted);
      text-decoration: line-through;
    }

    .empty {
      padding: var(--space-5);
      color: var(--muted);
      text-align: center;
    }

    @media (width <= 767px) {
      h1 {
        font-size: 22px;
        letter-spacing: -0.02em;
      }
    }
  `,
  template: `
    <div class="page">
      <header class="head">
        <div class="title">
          <span class="crumb"><a routerLink="/listas">Listas</a> /</span>
          <h1>{{ name }}</h1>
          @if (events(); as all) {
            <span class="summary">{{ countText(all.length) }} · vinculada al calendario</span>
          }
        </div>
        <app-add-button label="Nuevo evento" (pressed)="openCreate()" />
      </header>

      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="toolbar" role="search">
        <input
          class="input search"
          type="search"
          autocomplete="off"
          placeholder="Buscar un evento…"
          aria-label="Buscar un evento"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
      </div>

      @if (events() === null) {
        <p class="sr-only" role="status">Cargando los eventos…</p>
      } @else if (rows().length) {
        <section class="card" aria-label="Eventos">
          <table class="table">
            <thead class="sr-only">
              <tr>
                <th scope="col">Hecho</th>
                <th scope="col">Evento</th>
                <th scope="col">Fecha</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (event of rows(); track event.id) {
                <tr [class.done]="event.doneAt">
                  <td class="c-check">
                    <input
                      #check
                      type="checkbox"
                      class="check"
                      [attr.aria-label]="'Hecho: ' + event.title"
                      [checked]="!!event.doneAt"
                      (change)="toggleDone(event, check.checked)"
                    />
                  </td>
                  <td>
                    <span class="t">{{ event.title }}</span>
                  </td>
                  <td class="c-when num">{{ when(event) }}</td>
                  <td class="c-actions">
                    <button
                      type="button"
                      class="btn icon ghost"
                      [attr.aria-label]="'Editar: ' + event.title"
                      (click)="openEdit(event)"
                    >
                      <app-icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      class="btn icon ghost"
                      [attr.aria-label]="'Eliminar: ' + event.title"
                      (click)="confirmRemove(event)"
                    >
                      <app-icon name="trash" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      } @else {
        <p class="empty">
          {{
            query().trim()
              ? 'Ningún evento coincide con la búsqueda.'
              : 'Todavía no hay eventos. Añade el primero con «Nuevo evento».'
          }}
        </p>
      }
    </div>

    <app-event-dialog
      [open]="dialogOpen()"
      [event]="editing()"
      [defaultDate]="today()"
      (saved)="onSaved()"
      (closed)="dialogOpen.set(false)"
    />
    <p-confirmdialog />
  `,
})
export class EventsPage {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly name = EVENTS_LIST_NAME;
  /** Refreshed with every load, so a page left open past midnight does not keep yesterday's date. */
  protected readonly today = signal(todayIn(DEFAULT_TIME_ZONE));
  private readonly currentYear = computed(() => Number(this.today().slice(0, 4)));
  protected readonly countText = eventsCountText;

  /** `null` while loading. */
  protected readonly events = signal<CalendarEvent[] | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<EditedEvent | null>(null);

  protected readonly rows = computed(() =>
    sortEvents(filterEvents(this.events() ?? [], this.query()), this.today()),
  );

  constructor() {
    // Loads on entering and again after every change made anywhere (the calendar, a capture…).
    effect(() => {
      this.bus.version();
      untracked(() => this.load());
    });
  }

  private load(): void {
    this.today.set(todayIn(DEFAULT_TIME_ZONE));
    this.api.events().subscribe({
      next: (events) => this.events.set(events),
      error: (error: unknown) => {
        this.events.set([]);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  protected when(event: CalendarEvent): string {
    const day = formatDay(event.date, this.currentYear());
    return event.time ? `${day} · ${event.time}` : day;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(event: CalendarEvent): void {
    this.editing.set({
      id: event.id,
      title: event.title,
      dueDate: event.date,
      ...(event.time && { time: event.time }),
    });
    this.dialogOpen.set(true);
  }

  protected onSaved(): void {
    this.dialogOpen.set(false);
    this.error.set('');
    this.bus.changed();
  }

  protected toggleDone(event: CalendarEvent, done: boolean): void {
    this.api.updateEvent(event.id, { done }).subscribe({
      next: () => this.bus.changed(),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  protected confirmRemove(event: CalendarEvent): void {
    this.confirmation.confirm({
      header: 'Borrar evento',
      message: `¿Borrar «${event.title}»? No se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Borrar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () =>
        this.api.deleteEvent(event.id).subscribe({
          next: () => this.bus.changed(),
          error: (error: unknown) => this.error.set(apiErrorMessage(error)),
        }),
    });
  }
}
