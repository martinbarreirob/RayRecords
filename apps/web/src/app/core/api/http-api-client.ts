import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { List } from '@rayrecords/shared';
import type { Observable } from 'rxjs';
import { ApiClient } from './api-client';

/**
 * Implementación contra la API real. Los tipos vienen de `@rayrecords/shared`; la validación la
 * hace el servidor con los mismos esquemas, así que el cliente no necesita cargar Zod.
 */
@Injectable()
export class HttpApiClient extends ApiClient {
  private readonly http = inject(HttpClient);

  override lists(): Observable<List[]> {
    return this.http.get<List[]>('/api/lists');
  }
}
