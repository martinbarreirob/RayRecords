import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

// Bundle our own code, including @rayrecords/shared (a devDependency shipped as uncompiled TypeScript),
// and keep runtime dependencies external: the image installs them with `pnpm deploy --prod`.
await build({
  entryPoints: [
    'src/server.ts',
    'src/cli/create-user.ts',
    'src/cli/migrate-notes.ts',
    'src/cli/sync-catalog.ts',
  ],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: 'info',
});
