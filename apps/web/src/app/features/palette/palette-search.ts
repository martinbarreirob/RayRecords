import type { Item, List, Transaction } from '@rayrecords/shared';
import { catchError, forkJoin, map, of, type Observable } from 'rxjs';
import type { ApiClient } from '../../core/api/api-client';

/** Wait after the last key before asking the server. */
export const SEARCH_DEBOUNCE_MS = 200;
/** With fewer letters the server is not searched (only what is already loaded). */
export const MIN_REMOTE_CHARS = 2;
/** Maximum lists searched for cards (one request per list). */
const MAX_LISTS_SEARCHED = 12;
const REMOTE_ITEMS_PER_LIST = 8;
const REMOTE_TRANSACTIONS = 8;

export interface RemoteState {
  /** Query these data belong to. */
  query: string;
  items: Item[];
  transactions: Transaction[];
  /** Some request failed: the result may be incomplete. */
  failed: boolean;
}

export const EMPTY_REMOTE: RemoteState = { query: '', items: [], transactions: [], failed: false };

/**
 * Searches the server for what is not already loaded: cards (one request per list) and expense
 * movements. A single failure does not take down the rest: `failed` is set and what arrived is used.
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
