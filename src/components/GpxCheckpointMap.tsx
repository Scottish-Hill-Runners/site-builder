'use client';

import '@/lib/maplibre-worker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { gpx } from '@tmcw/togeojson';
import type { GeoJSON, LineString, MultiLineString } from 'geojson';
import type { CheckpointInput } from '@/lib/gpx-route-processing';

type Checkpoint = CheckpointInput & {
  id: string;
  lngLat: [number, number];
  marker: maplibregl.Marker;
};

export interface GpxCheckpointMapProps {
  gpxText: string;
  onChange: (checkpoints: CheckpointInput[]) => void;
}

function haversineMetres(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Returns the index of the closest point in `coords` to `click`. */
function nearestIndex(click: [number, number], coords: [number, number][]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMetres(click, coords[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function extractRouteCoords(geojson: GeoJSON): [number, number][] {
  const coords: [number, number][] = [];
  function collect(obj: GeoJSON) {
    if (obj.type === 'FeatureCollection') {
      obj.features.forEach(collect);
    } else if (obj.type === 'Feature') {
      collect(obj.geometry);
    } else if (obj.type === 'LineString') {
      (obj as LineString).coordinates.forEach((c) => coords.push([c[0], c[1]]));
    } else if (obj.type === 'MultiLineString') {
      (obj as MultiLineString).coordinates.forEach((line) => line.forEach((c) => coords.push([c[0], c[1]])));
    }
  }
  collect(geojson);
  return coords;
}

function getBounds(coords: [number, number][]): maplibregl.LngLatBoundsLike | null {
  if (coords.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function makeMarkerEl(label: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:28px;height:28px;border-radius:50%;',
    'background:#1d4ed8;border:3px solid white;',
    'display:flex;align-items:center;justify-content:center;',
    'font-size:11px;font-weight:700;color:white;',
    'box-shadow:0 2px 6px rgba(0,0,0,0.45);',
    'cursor:pointer;user-select:none;',
  ].join('');
  el.textContent = label;
  return el;
}

function toCheckpointInputs(checkpoints: Checkpoint[]): CheckpointInput[] {
  return checkpoints.map(({ trackPointIndex, name, cutoff, notes }) => ({
    trackPointIndex,
    name,
    cutoff,
    notes,
  }));
}

/**
 * Client-only map that lets a runner drop optional checkpoints along an
 * uploaded GPX route by clicking on it; clicks snap to the nearest track point.
 */
export default function GpxCheckpointMap({ gpxText, onChange }: GpxCheckpointMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeCoordsRef = useRef<[number, number][]>([]);
  const checkpointsRef = useRef<Checkpoint[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const notify = useCallback(
    (cps: Checkpoint[]) => {
      onChange(toCheckpointInputs(cps));
    },
    [onChange]
  );

  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);

  // Notify parent whenever checkpoints state settles — must be an effect, not
  // called inside a setState updater, to avoid "setState during render" errors.
  useEffect(() => {
    notify(checkpoints);
  }, [checkpoints, notify]);

  // Parsing is derived from `gpxText` alone, so it belongs in a memo computed
  // during render rather than a setState call inside the map-creation effect.
  const parsed = useMemo((): { error: string | null; geojson: GeoJSON | null; routeCoords: [number, number][] } => {
    if (!gpxText) return { error: null, geojson: null, routeCoords: [] };
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
      if (xmlDoc.querySelector('parsererror')) throw new Error('GPX could not be parsed');
      const geojson = gpx(xmlDoc);
      const routeCoords = extractRouteCoords(geojson);
      if (routeCoords.length === 0) {
        return { error: 'No track coordinates found in GPX file', geojson: null, routeCoords: [] };
      }
      return { error: null, geojson, routeCoords };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : 'GPX file could not be read',
        geojson: null,
        routeCoords: [],
      };
    }
  }, [gpxText]);

  useEffect(() => {
    if (!containerRef.current || !parsed.geojson) return;
    let cancelled = false;

    const geojson = parsed.geojson;
    const routeCoords = parsed.routeCoords;
    routeCoordsRef.current = routeCoords;

    const bounds = getBounds(routeCoords);
    const [sw, ne] = bounds as [[number, number], [number, number]];
    const center: [number, number] = [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2];

    const osKey = process.env.NEXT_PUBLIC_OS_MAPS_API_KEY ?? '';
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
    const hasOs = osKey.length > 0;
    const hasDem = maptilerKey.length > 0;

    const sources: maplibregl.StyleSpecification['sources'] = {
      'os-raster': {
        type: 'raster',
        tiles: hasOs
          ? [`https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=${osKey}`]
          : ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: hasOs
          ? '&copy; <a href="https://www.ordnancesurvey.co.uk">Ordnance Survey</a>'
          : '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        minzoom: hasOs ? 7 : 0,
        maxzoom: hasOs ? 20 : 17,
      },
    };

    if (hasDem) {
      const demSource: maplibregl.RasterDEMSourceSpecification = {
        type: 'raster-dem',
        url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${maptilerKey}`,
        tileSize: 256,
        encoding: 'mapbox',
      };
      sources['terrain-dem'] = demSource;
      sources['hillshade-dem'] = { ...demSource };
    }

    const layers: maplibregl.LayerSpecification[] = [{ id: 'os-raster', type: 'raster', source: 'os-raster' }];
    if (hasDem) {
      layers.push({
        id: 'hillshade',
        type: 'hillshade',
        source: 'hillshade-dem',
        paint: { 'hillshade-exaggeration': 0.4, 'hillshade-shadow-color': '#3d2b1f' },
      });
    }

    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: {
        version: 8,
        sources,
        layers,
        ...(hasDem ? { terrain: { source: 'terrain-dem', exaggeration: 1.2 } } : {}),
      } as maplibregl.StyleSpecification,
      center,
      zoom: 10,
      maxBounds: [
        [-10.76, 49.52],
        [2.0, 61.4],
      ],
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), 'top-right');

    let osFailed = false;
    map.on('error', (e) => {
      const msg = e && typeof e === 'object' && 'error' in e ? ((e as unknown as { error: Error }).error?.message ?? String(e)) : String(e);
      if (hasOs && !osFailed && msg.includes('os.uk')) {
        osFailed = true;
        const src = map.getSource('os-raster') as maplibregl.RasterTileSource | undefined;
        src?.setTiles(['https://tile.opentopomap.org/{z}/{x}/{y}.png']);
      }
    });

    map.on('load', () => {
      if (cancelled) return;

      map.addSource('gpx-route', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'gpx-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 8, 'line-opacity': 0.15, 'line-blur': 3 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'gpx-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#e63012', 'line-width': 3.5, 'line-opacity': 0.95 },
      });

      if (routeCoords.length > 0) {
        const startEl = document.createElement('div');
        startEl.style.cssText = [
          'width:28px;height:28px;border-radius:50%;',
          'background:#16a34a;border:3px solid white;',
          'display:flex;align-items:center;justify-content:center;',
          'font-size:11px;font-weight:700;color:white;',
          'box-shadow:0 2px 6px rgba(0,0,0,0.45);',
        ].join('');
        startEl.textContent = 'S';
        new maplibregl.Marker({ element: startEl, anchor: 'center' }).setLngLat(routeCoords[0]).addTo(map);

        const finishEl = document.createElement('div');
        finishEl.style.cssText = [
          'width:28px;height:28px;border-radius:50%;',
          'background:#dc2626;border:3px solid white;',
          'display:flex;align-items:center;justify-content:center;',
          'font-size:11px;font-weight:700;color:white;',
          'box-shadow:0 2px 6px rgba(0,0,0,0.45);',
        ].join('');
        finishEl.textContent = 'F';
        new maplibregl.Marker({ element: finishEl, anchor: 'center' })
          .setLngLat(routeCoords[routeCoords.length - 1])
          .addTo(map);
      }

      if (bounds) {
        map.fitBounds(bounds as maplibregl.LngLatBoundsLike, { padding: 56, duration: 0 });
        map.resize();
      }

      map.on('click', (e) => {
        if (cancelled) return;
        const click: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const coords = routeCoordsRef.current;
        if (coords.length === 0) return;

        const idx = nearestIndex(click, coords);
        const snapped = coords[idx];

        const currentCps = checkpointsRef.current;
        if (currentCps.some((cp) => cp.trackPointIndex === idx)) return;

        const cpNumber = currentCps.length + 1;
        const markerEl = makeMarkerEl(`${cpNumber}`);
        const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' }).setLngLat(snapped).addTo(map);

        const newCp: Checkpoint = {
          id: crypto.randomUUID(),
          trackPointIndex: idx,
          lngLat: snapped,
          name: `CP${cpNumber}`,
          cutoff: '',
          notes: '',
          marker,
        };

        setCheckpoints((prev) => [...prev, newCp]);
      });

      map.on('mouseenter', 'route-line', () => {
        map.getCanvas().style.cursor = 'crosshair';
      });
      map.on('mouseleave', 'route-line', () => {
        map.getCanvas().style.cursor = '';
      });
      map.getCanvas().style.cursor = 'crosshair';

      setMapReady(true);
    });

    return () => {
      cancelled = true;
      checkpointsRef.current.forEach((cp) => cp.marker.remove());
      try {
        map.remove();
      } catch {
        /* suppress WebGL cleanup errors */
      }
      mapRef.current = null;
    };
  }, [parsed]);

  const updateField = useCallback((id: string, field: keyof Pick<Checkpoint, 'name' | 'cutoff' | 'notes'>, value: string) => {
    setCheckpoints((prev) => prev.map((cp) => (cp.id === id ? { ...cp, [field]: value } : cp)));
  }, []);

  const removeCheckpoint = useCallback((id: string) => {
    setCheckpoints((prev) => {
      const target = prev.find((cp) => cp.id === id);
      target?.marker.remove();
      return prev
        .filter((cp) => cp.id !== id)
        .map((cp, i) => {
          const el = cp.marker.getElement();
          if (el) el.textContent = `${i + 1}`;
          return cp;
        });
    });
  }, []);

  if (parsed.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        Could not display route map: {parsed.error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">Checkpoints (optional)</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          Click anywhere on the route to place a checkpoint. It will snap to the nearest track point.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700" style={{ height: 360 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 dark:bg-slate-800">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
          </div>
        )}
      </div>

      {checkpoints.length > 0 && (
        <div className="space-y-3">
          {checkpoints.map((cp, i) => (
            <div key={cp.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[11px] font-bold text-white"
                >
                  {i + 1}
                </span>

                <div className="grid flex-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`cp-name-${cp.id}`} className="block text-xs font-medium text-gray-600 dark:text-slate-400">
                      Name
                    </label>
                    <input
                      id={`cp-name-${cp.id}`}
                      type="text"
                      value={cp.name}
                      onChange={(e) => updateField(cp.id, 'name', e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cp-cutoff-${cp.id}`} className="block text-xs font-medium text-gray-600 dark:text-slate-400">
                      Cutoff time
                    </label>
                    <input
                      id={`cp-cutoff-${cp.id}`}
                      type="text"
                      placeholder="HH:MM"
                      value={cp.cutoff}
                      onChange={(e) => updateField(cp.id, 'cutoff', e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor={`cp-notes-${cp.id}`} className="block text-xs font-medium text-gray-600 dark:text-slate-400">
                      Notes
                    </label>
                    <input
                      id={`cp-notes-${cp.id}`}
                      type="text"
                      value={cp.notes}
                      onChange={(e) => updateField(cp.id, 'notes', e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeCheckpoint(cp.id)}
                  aria-label={`Remove checkpoint ${i + 1}`}
                  className="mt-0.5 shrink-0 text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
