import type { List } from '@rayrecords/shared';
import type { Observable } from 'rxjs';

/**
 * Contrato entre la UI y los datos. Las pantallas dependen de esta clase abstracta, nunca de
 * HttpClient: así se puede sustituir la implementación (p. ej. un adaptador en memoria para una
 * demo pública sin backend) sin tocar ninguna pantalla.
 */
export abstract class ApiClient {
  abstract lists(): Observable<List[]>;
}
