import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Liveness: siempre responde 200 si el proceso está vivo. `db` informa del estado de Mongo
 * sin hacer fallar el healthcheck de Docker, para que una caída de la BD no impida arrancar nginx.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      config: { public: true },
      schema: { response: { 200: z.object({ status: z.literal('ok'), db: z.boolean() }) } },
    },
    async () => {
      const db = await app.db.db
        .command({ ping: 1 }, { timeoutMS: 2_000 })
        .then(() => true)
        .catch(() => false);
      return { status: 'ok' as const, db };
    },
  );
};
