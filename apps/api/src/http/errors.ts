import type { ApiErrorBody } from '@rayrecords/shared';
import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** Error esperado con código estable para el cliente. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'too_many_requests',
};

/** Todos los errores (validación, 404, límite de peticiones, imprevistos) salen con el mismo formato. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    let status = 500;
    let body: ApiErrorBody;

    if (hasZodFastifySchemaValidationErrors(error)) {
      status = 400;
      body = {
        error: {
          code: 'validation_error',
          message: 'Datos inválidos',
          details: error.validation.map((issue) => ({
            path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
            message: issue.message ?? 'Inválido',
          })),
        },
      };
    } else if (error instanceof ApiError) {
      status = error.statusCode;
      body = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
      };
    } else {
      const candidate = (error as { statusCode?: number }).statusCode;
      status = candidate && candidate >= 400 && candidate < 600 ? candidate : 500;
      if (status >= 500) {
        request.log.error(error);
        body = { error: { code: 'internal_error', message: 'Error interno' } };
      } else {
        body = {
          error: {
            code: STATUS_CODES[status] ?? 'error',
            message:
              status === 429 ? 'Demasiados intentos, espera un momento' : (error as Error).message,
          },
        };
      }
    }
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'not_found', message: `No existe ${request.method} ${request.url}` },
    } satisfies ApiErrorBody),
  );
}
