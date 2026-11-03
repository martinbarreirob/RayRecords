import { Component, computed, input } from '@angular/core';
import { DEFAULT_TIME_ZONE, isValidDateOnly, todayIn } from '@rayrecords/shared';

@Component({
  selector: 'app-notes-page',
  template: `
    <h1>Nota del día</h1>
    <p>{{ day() }}</p>
    <!-- Pendiente: editor markdown de la nota (GET/PUT /api/notes/:date) y navegación entre días.
         Lo que se captura sin prefijo se añade aquí como una línea nueva. -->
  `,
})
export class NotesPage {
  /** Parámetro opcional `:date`; si falta o no es una fecha válida, se usa hoy. */
  readonly date = input<string>();
  protected readonly day = computed(() => {
    const date = this.date();
    return date && isValidDateOnly(date) ? date : todayIn(DEFAULT_TIME_ZONE);
  });
}
