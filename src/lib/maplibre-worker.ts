// Next.js can't resolve maplibre-gl's worker via import.meta.url, so we
// point it at the copies emitted by scripts/copy-maplibre-worker.mjs.
import { setWorkerUrl } from 'maplibre-gl';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
