import { Component } from '@angular/core';

@Component({
  selector: 'app-calendar-page',
  template: `
    <h1>Calendario</h1>
    <!-- Pendiente: vista mensual/agenda alimentada por los elementos con dueDate
         (GET /api/calendar?from=&to=), con las tareas de hoy: / mañana: y los eventos. -->
  `,
})
export class CalendarPage {}
