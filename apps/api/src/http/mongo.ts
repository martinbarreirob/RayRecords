import { MongoServerError } from 'mongodb';

/** Whether the error is a unique index violation; with `index`, also checks which one by name. */
export function isDuplicateKey(error: unknown, index?: string): boolean {
  return (
    error instanceof MongoServerError &&
    error.code === 11000 &&
    (index === undefined || error.message.includes(index))
  );
}
