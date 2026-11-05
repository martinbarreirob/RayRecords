import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Liveness: always answers 200 while the process is alive. `db` reports Mongo's state without
 * failing the Docker healthcheck, so a database outage does not stop nginx from starting.
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
