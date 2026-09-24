// Next.js/Turbopack can't bundle maplibre-gl's worker; copy it (and its
// sibling shared chunk) into public/ so setWorkerUrl() can point at it directly.
// See: https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md#esm
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const dist = path.join(
  path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
  'dist',
);
const dest = path.join(process.cwd(), 'public', 'maplibre');

mkdirSync(dest, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
