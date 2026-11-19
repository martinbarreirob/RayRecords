import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from 'mongodb';
import { getCollections, type Collections } from './client';

/**
 * The data of the signed-in user. Each user's notes, lists, expenses, stock and sales live in
 * collections of their own, so one user can never read another one's: there is no filter to forget.
 * The guard opens the right database for the request and runs the rest of it inside this scope.
 */
const scope = new AsyncLocalStorage<Collections>();

/** Runs `fn` (and everything it awaits) with `collections` as the data of the current request. */
export function runWithData<T>(collections: Collections, fn: () => T): T {
  return scope.run(collections, fn);
}

/**
 * The collections of the user of the current request. It is a stand-in with the same shape as
 * `Collections`, resolved on each access, so a route can keep a single `const c = app.data`.
 * Using it outside a signed-in request (public routes, startup) throws instead of guessing a user.
 */
export function scopedCollections(): Collections {
  return new Proxy({} as Collections, {
    get(_target, name) {
      // Anything that is not a collection (what Fastify looks at when it decorates, for example)
      // is not an access to user data.
      if (typeof name !== 'string' || !COLLECTION_NAMES.has(name)) return undefined;
      const collections = scope.getStore();
      if (!collections) throw new Error('User data was requested outside a signed-in request');
      return collections[name as keyof Collections];
    },
  });
}

const COLLECTION_NAMES = new Set(
  Object.keys(getCollections({ collection: () => ({}) } as unknown as Db)),
);
