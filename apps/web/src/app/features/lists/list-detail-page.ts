import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListsStore } from './lists.store';

@Component({
  selector: 'app-list-detail-page',
  imports: [RouterLink],
  template: `
    <p><a routerLink="/listas">← Listas</a></p>

    @if (list(); as list) {
      <h1>{{ list.name }}</h1>

      @if (list.board; as board) {
        <h2>Tablero</h2>
        <ul>
          @for (column of board.columns; track column.key) {
            <li>{{ column.label }}</li>
          }
        </ul>
      }

      @if (list.fieldDefs.length) {
        <h2>Campos</h2>
        <ul>
          @for (field of list.fieldDefs; track field.key) {
            <li>
              {{ field.label }} <small>({{ field.type }})</small>
            </li>
          }
        </ul>
      }

      <!-- Pendiente: elementos de la lista (GET /api/lists/:id/items) y, si tiene board, vista Kanban. -->
    } @else if (store.lists()) {
      <p>No existe ninguna lista «{{ slug() }}».</p>
    } @else {
      <p>Cargando…</p>
    }
  `,
})
export class ListDetailPage {
  protected readonly store = inject(ListsStore);
  /** Parámetro `:slug` de la ruta (llega por `withComponentInputBinding`). */
  readonly slug = input.required<string>();
  protected readonly list = computed(() => this.store.lists()?.find((l) => l.slug === this.slug()));
}
