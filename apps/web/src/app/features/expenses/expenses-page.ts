import { Component } from '@angular/core';

@Component({
  selector: 'app-expenses-page',
  template: `
    <h1>Gastos</h1>
    <!-- Pendiente: importación del CSV del banco, tabla de movimientos con corrección manual de
         categoría, gráficos por mes y categoría (GET /api/expenses/summary) y gestión de reglas. -->
  `,
})
export class ExpensesPage {}
