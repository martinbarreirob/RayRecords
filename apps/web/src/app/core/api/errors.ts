import { HttpErrorResponse } from '@angular/common/http';

/** Mensaje legible de un error de la API (formato `{ error: { message, details? } }`). */
export function apiErrorMessage(error: unknown, fallback = 'Ha ocurrido un error'): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as
      { error?: { message?: string; details?: { path: string; message: string }[] } } | undefined;
    const details = body?.error?.details?.map((d) => `${d.path}: ${d.message}`).join('; ');
    if (body?.error?.message)
      return details ? `${body.error.message} (${details})` : body.error.message;
    if (error.status === 0) return 'No se puede conectar con el servidor';
  }
  return fallback;
}
