import { buildApp } from './app';
import { loadConfig } from './config';
import { connectDatabase } from './db/client';
import { ensureIndexes } from './db/indexes';

const config = loadConfig();
const database = await connectDatabase(config);
await ensureIndexes(database.collections);

const app = await buildApp({ config, database });

// `docker stop` envía SIGTERM: cerrar con orden para no cortar peticiones ni conexiones a Mongo.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} recibido, cerrando`);
    await app.close();
    await database.close();
    process.exit(0);
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await database.close();
  process.exit(1);
}
