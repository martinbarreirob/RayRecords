// Builds the final nginx config: puts the hashes of the inline scripts of the built index.html
// into the Content-Security-Policy. Run from the repository root during the web image build.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('apps/web/dist/web/browser/index.html', 'utf8');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`,
);
if (hashes.length === 0) throw new Error('No inline scripts found in index.html');

const conf = readFileSync('deploy/nginx/nginx.conf', 'utf8').replace('__SCRIPT_HASHES__', hashes.join(' '));
writeFileSync('/tmp/default.conf', conf);
