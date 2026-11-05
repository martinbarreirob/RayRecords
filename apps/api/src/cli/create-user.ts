import { loadConfig } from '../config';
import { connectDatabase } from '../db/client';
import { ensureIndexes } from '../db/indexes';
import { upsertUser } from '../modules/auth/users';

/**
 * Creates the single user or changes its password.
 *   pnpm --filter @rayrecords/api create-user <username>
 *   docker compose exec api node dist/cli/create-user.js <username>
 * The password is read from the terminal without echo; without a terminal it comes from RR_PASSWORD.
 */
async function readPassword(): Promise<string> {
  const fromEnv = process.env.RR_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error('No terminal: set the RR_PASSWORD variable');

  process.stdout.write('Password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      process.stdin.on('data', function onData(chunk: Buffer) {
        for (const char of chunk.toString('utf8')) {
          if (char === '\r' || char === '\n') {
            process.stdin.off('data', onData);
            process.stdout.write('\n');
            return resolve(value);
          }
          if (char === '\u0003') return reject(new Error('Cancelled'));
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else value += char;
        }
      });
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

async function main() {
  const username = process.argv[2]?.trim();
  if (!username) throw new Error('Usage: create-user <username>');
  const password = await readPassword();

  const database = await connectDatabase(loadConfig());
  try {
    await ensureIndexes(database.collections);
    const result = await upsertUser(database.collections, username, password);
    console.log(
      result === 'created'
        ? `User "${username}" created.`
        : `Password for "${username}" updated and sessions closed.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
