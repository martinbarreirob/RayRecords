import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CalendarEntry } from '@rayrecords/shared';
import { DialogModule } from 'primeng/dialog';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { DateField } from '../../core/ui/date-field';
import { TimeField } from '../../core/ui/time-field';

/**
 * Creates an event of the calendar or edits one: its title, date and time. With no `event` it
 * creates (the date starts at `defaultDate`). It saves on its own and notifies with `saved` (the
 * date, so the screen can show the day where the event ended up).
 */
@Component({
  selector: 'app-event-dialog',
  imports: [DialogModule, FormsModule, DateField, TimeField],
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
    }

    .wide {
      grid-column: 1 / -1;
    }

    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      width: 100%;
    }
  `,
  template: `
    <p-dialog
      [header]="event() ? 'Editar evento' : 'Nuevo evento'"
      [visible]="open()"
      (visibleChange)="$event || closed.emit()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!dirty()"
      [style]="{ width: 'min(480px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
    >
      <form id="event-form" class="grid" novalidate (submit)="save($event)">
        <label class="field wide">
          <span>Título</span>
          <input
            id="event-title"
            class="input"
            type="text"
            name="title"
            autocomplete="off"
            maxlength="300"
            required
            [ngModel]="title()"
            (ngModelChange)="title.set($event)"
          />
        </label>
        <div class="field">
          <label for="event-date">Fecha</label>
          <app-date-field inputId="event-date" [required]="true" [(value)]="date" />
        </div>
        <div class="field">
          <label for="event-time">Hora (opcional)</label>
          <app-time-field inputId="event-time" [(value)]="time" />
        </div>
      </form>

      <ng-template #footer>
        <div class="foot">
          @if (error(); as message) {
            <p class="alert" role="alert">{{ message }}</p>
          }
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button
            type="submit"
            form="event-form"
            class="btn primary"
            [disabled]="saving() || !title().trim() || !date()"
          >
            {{ event() ? 'Guardar' : 'Añadir' }}
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class EventDialog {
  private readonly api = inject(ApiClient);

  readonly open = input(false);
  /** The event being edited; `null` creates a new one. */
  readonly event = input<Pick<CalendarEntry, 'id' | 'title' | 'dueDate' | 'time'> | null>(null);
  /** The date a new event starts on. */
  readonly defaultDate = input('');

  readonly saved = output<string>();
  readonly closed = output<void>();

  protected readonly title = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  private readonly initial = signal('');

  protected readonly dirty = computed(
    () => JSON.stringify([this.title(), this.date(), this.time()]) !== this.initial(),
  );

  constructor() {
    // Each time it opens, the fields start from the event.
    effect(() => {
      if (!this.open()) return;
      const event = this.event();
      const values = [
        event?.title ?? '',
        event?.dueDate ?? this.defaultDate(),
        event?.time ?? '',
      ] as const;
      this.title.set(values[0]);
      this.date.set(values[1]);
      this.time.set(values[2]);
      this.initial.set(JSON.stringify(values));
      this.error.set('');
    });
  }

  protected save(event: Event): void {
    event.preventDefault();
    const target = this.event();
    const title = this.title().trim();
    const date = this.date();
    if (!title || !date || this.saving()) return;
    this.saving.set(true);
    const time = this.time();
    const request = target
      ? this.api.updateEvent(target.id, { title, date, time: time || null })
      : this.api.createEvent({ title, date, ...(time && { time }) });
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit(date);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
