import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { Database } from './db/client';
import { healthRoutes } from './modules/health/routes';
import { listsRoutes } from './modules/lists/routes';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface AppOptions {
  config: Pick<Config, 'nodeEnv' | 'logLevel'>;
  database: Database;
}

export async function buildApp({ config, database }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    // Detrás de nginx (y de `tailscale serve`): confiar en X-Forwarded-* para IP y protocolo.
    trustProxy: true,
    logger:
      config.nodeEnv === 'development'
        ? { level: config.logLevel, transport: { target: 'pino-pretty' } }
        : { level: config.logLevel },
  });

  // Los esquemas Zod de @rayrecords/shared validan las entradas y serializan las salidas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', database);

  // Todos los módulos cuelgan de /api, que es lo que nginx enruta hacia aquí.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(listsRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
