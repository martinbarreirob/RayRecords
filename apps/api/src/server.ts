import { buildApp } from './app';
import { loadConfig } from './config';
import { connectDatabase } from './db/client';
import { ensureIndexes } from './db/indexes';

const config = loadConfig();
const database = await connectDatabase(config);
await ensureIndexes(database.collections);

const app = await buildApp({ config, database });

// `docker stop` sends SIGTERM: shut down cleanly so in-flight requests and Mongo connections finish.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
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
