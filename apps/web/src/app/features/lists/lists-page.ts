import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListsStore } from './lists.store';

@Component({
  selector: 'app-lists-page',
  imports: [RouterLink],
  template: `
    <h1>Listas</h1>

    @if (store.failed()) {
      <p role="alert">
        No se pudieron cargar las listas.
        <button type="button" (click)="store.load()">Reintentar</button>
      </p>
    } @else if (store.lists(); as lists) {
      <ul>
        @for (list of lists; track list.id) {
          <li>
            <a [routerLink]="['/listas', list.slug]">{{ list.name }}</a>
            @if (list.captureAlias) {
              <small
                >· captura: <code>{{ list.captureAlias }}:</code></small
              >
            }
          </li>
        } @empty {
          <li>Todavía no hay listas.</li>
        }
      </ul>
      <!-- Pendiente: crear lista desde una plantilla (LIST_PRESETS) con un formulario mínimo. -->
    } @else {
      <p>Cargando…</p>
    }
  `,
})
export class ListsPage {
  protected readonly store = inject(ListsStore);
}
