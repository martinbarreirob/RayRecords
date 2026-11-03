import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  MONGO_URI: z.string().min(1).optional(),
  MONGO_DB: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  mongoUri: string;
  mongoDb: string;
  logLevel: string;
}

/** Valida el entorno. En producción la conexión a Mongo es obligatoria: no hay valores por defecto. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const isProd = parsed.NODE_ENV === 'production';

  const mongoUri = parsed.MONGO_URI ?? (isProd ? undefined : 'mongodb://127.0.0.1:27017');
  const mongoDb = parsed.MONGO_DB ?? (isProd ? undefined : 'rayrecords_dev');
  if (!mongoUri || !mongoDb) {
    throw new Error('MONGO_URI y MONGO_DB son obligatorios en producción');
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    mongoUri,
    mongoDb,
    logLevel: parsed.LOG_LEVEL,
  };
}
