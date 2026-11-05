import type { Item, List, Transaction } from '@rayrecords/shared';
import { catchError, forkJoin, map, of, type Observable } from 'rxjs';
import type { ApiClient } from '../../core/api/api-client';

/** Espera tras la última tecla antes de preguntar al servidor. */
export const SEARCH_DEBOUNCE_MS = 200;
/** Con menos letras no se busca en el servidor (solo en lo ya cargado). */
export const MIN_REMOTE_CHARS = 2;
/** Listas en las que se buscan tarjetas como máximo (una petición por lista). */
const MAX_LISTS_SEARCHED = 12;
const REMOTE_ITEMS_PER_LIST = 8;
const REMOTE_TRANSACTIONS = 8;

export interface RemoteState {
  /** Consulta a la que corresponden estos datos. */
  query: string;
  items: Item[];
  transactions: Transaction[];
  /** Alguna petición falló: el resultado puede estar incompleto. */
  failed: boolean;
}

export const EMPTY_REMOTE: RemoteState = { query: '', items: [], transactions: [], failed: false };

/**
 * Busca en el servidor lo que no está ya cargado: tarjetas (una petición por lista) y movimientos
 * de gastos. Un fallo suelto no tumba el resto: se marca `failed` y se sigue con lo que llegó.
 */
export function searchRemote(
  api: ApiClient,
  query: string,
  lists: List[],
): Observable<RemoteState> {
  if (query.length < MIN_REMOTE_CHARS) return of({ ...EMPTY_REMOTE, query });
  const text = query.slice(0, 100);
  let failed = false;
  const orEmpty = <T>(source: Observable<T[]>): Observable<T[]> =>
    source.pipe(
      catchError(() => {
        failed = true;
        return of([] as T[]);
      }),
    );

  const targets = lists.filter((list) => !list.archived).slice(0, MAX_LISTS_SEARCHED);
  const items$: Observable<Item[][]> = targets.length
    ? forkJoin(
        targets.map((list) =>
          orEmpty(
            api
              .items(list.id, { q: text })
              .pipe(map((items) => items.slice(0, REMOTE_ITEMS_PER_LIST))),
          ),
        ),
      )
    : of([]);
  const transactions$ = orEmpty(
    api.transactions({ q: text, limit: REMOTE_TRANSACTIONS }).pipe(map((page) => page.items)),
  );

  return forkJoin({ items: items$, transactions: transactions$ }).pipe(
    map(({ items, transactions }) => ({
      query,
      items: items.flat(),
      transactions,
      failed,
    })),
  );
}
