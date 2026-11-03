import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

// Se empaqueta el código propio, incluido @rayrecords/shared (devDependency, es TypeScript sin compilar),
// y se dejan como externas las dependencias de runtime, que la imagen instala con `pnpm deploy --prod`.
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: 'info',
});
