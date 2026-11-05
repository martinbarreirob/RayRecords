import { MongoServerError } from 'mongodb';

/** ¿Es una violación de índice único? Con `index` se comprueba además cuál (por nombre). */
export function isDuplicateKey(error: unknown, index?: string): boolean {
  return (
    error instanceof MongoServerError &&
    error.code === 11000 &&
    (index === undefined || error.message.includes(index))
  );
}
