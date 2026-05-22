'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';

interface RouteMapProps {
  raceId: string;
  raceName: string;
}

interface LngLat {
  lng: number;
  lat: number;
}

interface CheckpointProperties {
  type: 'checkpoint';
  name?: string;
  cutoff?: string;
  notes?: string;
}

function getBounds(geojson: GeoJSON): maplibregl.LngLatBoundsLike | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  function expand(lng: number, lat: number) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  function collect(obj: GeoJSON) {
    if (obj.type === 'FeatureCollection') {
      obj.features.forEach(collect);
    } else if (obj.type === 'Feature') {
      collect(obj.geometry);
    } else if (obj.type === 'LineString') {
      obj.coordinates.forEach((c) => expand(c[0], c[1]));
    } else if (obj.type === 'MultiLineString') {
      obj.coordinates.forEach((line) => line.forEach((c) => expand(c[0], c[1])));
    } else if (obj.type === 'GeometryCollection') {
      obj.geometries.forEach(collect);
    }
  }
  collect(geojson);
  if (minLng === Infinity) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function getEndpoints(geojson: GeoJSON): {
  start: LngLat | null;
  end: LngLat | null;
} {
  let start: LngLat | null = null;
  let end: LngLat | null = null;
  function visit(c: number[]) {
    if (!start) start = { lng: c[0], lat: c[1] };
    end = { lng: c[0], lat: c[1] };
  }
  function collect(obj: GeoJSON) {
    if (obj.type === 'FeatureCollection') {
      obj.features.forEach(collect);
    } else if (obj.type === 'Feature') {
      collect(obj.geometry);
    } else if (obj.type === 'LineString') {
      obj.coordinates.forEach(visit);
    } else if (obj.type === 'MultiLineString') {
      obj.coordinates.forEach((line) => line.forEach(visit));
    } else if (obj.type === 'GeometryCollection') {
      obj.geometries.forEach(collect);
    }
  }
  collect(geojson);
  return { start, end };
}

function createMarkerEl(label: string, color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    background: ${color}; border: 3px solid white;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.45);
    cursor: default; user-select: none;
  `;
  el.textContent = label;
  return el;
}

function getAllCoordinates(geojson: GeoJSON): [number, number][] {
  const coords: [number, number][] = [];
  function collect(obj: GeoJSON) {
    if (obj.type === 'FeatureCollection') {
      obj.features.forEach(collect);
    } else if (obj.type === 'Feature') {
      collect(obj.geometry);
    } else if (obj.type === 'LineString') {
      obj.coordinates.forEach((c) => coords.push([c[0], c[1]]));
    } else if (obj.type === 'MultiLineString') {
      obj.coordinates.forEach((line) =>
        line.forEach((c) => coords.push([c[0], c[1]]))
      );
    } else if (obj.type === 'GeometryCollection') {
      obj.geometries.forEach(collect);
    }
  }
  collect(geojson);
  return coords;
}

function haversineMetres(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function buildCumulativeDistances(coords: [number, number][]): number[] {
  const cumDists = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDists.push(cumDists[i - 1] + haversineMetres(coords[i - 1], coords[i]));
  }
  return cumDists;
}

function sampleRoute(
  coords: [number, number][],
  cumDists: number[],
  totalDist: number,
  t: number,
): [number, number] {
  const target = Math.min(t * totalDist, totalDist);
  let lo = 0;
  let hi = cumDists.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumDists[mid] <= target) lo = mid;
    else hi = mid;
  }
  const segLen = cumDists[hi] - cumDists[lo];
  if (segLen === 0) return coords[lo];
  const frac = (target - cumDists[lo]) / segLen;
  const a = coords[lo];
  const b = coords[hi];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export default function RouteMap({ raceId, raceName }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [errorMsg, setErrorMsg] = useState<string>('');

  const osKey = process.env.NEXT_PUBLIC_OS_MAPS_API_KEY ?? '';
  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

  useEffect(() => {
    if (!containerRef.current) return;

    // cancelled flag prevents stale async continuations from acting after
    // cleanup — critical for React Strict Mode which mounts effects twice.
    let cancelled = false;

    async function init() {
      try {
        // Fetch GeoJSON route
        const geojsonUrl = `/results/${encodeURIComponent(raceId)}.geojson`;
        const res = await fetch(geojsonUrl);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Route file not found (${res.status})`);
        const geojson = (await res.json()) as GeoJSON;
        if (cancelled) return;

        const bounds = getBounds(geojson);
        const { start, end } = getEndpoints(geojson);

        if (!bounds) throw new Error('No route coordinates found in GeoJSON file');
        if (!containerRef.current || cancelled) return;

        // Derive initial centre from the route bounding box so the first tile
        // requests land over the route, not at the default world origin.
        const sw = (bounds as [[number, number], [number, number]])[0];
        const ne = (bounds as [[number, number], [number, number]])[1];
        const routeCenter: [number, number] = [
          (sw[0] + ne[0]) / 2,
          (sw[1] + ne[1]) / 2,
        ];

        const hasDem = maptilerKey.length > 0;
        const hasOs = osKey.length > 0;

        const sources: maplibregl.StyleSpecification['sources'] = {
          'os-raster': {
            type: 'raster',
            tiles: hasOs
              ? [
                  `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=${osKey}`,
                ]
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
          const demSource = {
            type: 'raster-dem' as const,
            url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${maptilerKey}`,
            tileSize: 256,
            encoding: 'mapbox' as const,
          };
          // Use two separate sources: one for terrain extrusion, one for hillshade
          // (MapLibre recommends this to avoid rendering artefacts)
          sources['terrain-dem'] = demSource;
          sources['hillshade-dem'] = { ...demSource };
        }

        const layers: maplibregl.LayerSpecification[] = [
          {
            id: 'os-raster',
            type: 'raster',
            source: 'os-raster',
          },
        ];

        if (hasDem) {
          layers.push({
            id: 'hillshade',
            type: 'hillshade',
            source: 'hillshade-dem',
            paint: {
              'hillshade-exaggeration': 0.4,
              'hillshade-shadow-color': '#3d2b1f',
            },
          });
        }

        const style: maplibregl.StyleSpecification = {
          version: 8,
          sources,
          layers,
          ...(hasDem
            ? { terrain: { source: 'terrain-dem', exaggeration: 1.2 } }
            : {}),
        };

        const map = new maplibregl.Map({
          container: containerRef.current!,
          style,
          center: routeCenter,
          zoom: 10,
          minZoom: 7,
          maxZoom: 20,
          pitch: 0,
          bearing: 0,
          maxBounds: [
            [-10.76, 49.52],
            [2.0, 61.4],
          ],
          attributionControl: false,
        });

        mapRef.current = map;

        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          'bottom-right'
        );
        // visualizePitch: true — compass tilts to show pitch angle and clicking
        // it resets both bearing and pitch to 0 (standard MapLibre behaviour).
        map.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true,
            showZoom: true,
            showCompass: true,
          }),
          'top-right'
        );

        if (hasDem) {
          // Custom 3D/2D toggle button — explicitly toggles pitch 0↔50.
          // Styled to match the MapLibre ctrl-group buttons.
          let is3D = false;
          const syncBtn = (pitched: boolean) => {
            is3D = pitched;
            pitchBtn.setAttribute('aria-pressed', String(is3D));
            pitchBtn.style.color = is3D ? '#2563eb' : '#333';
            pitchBtn.title = is3D ? 'Switch to 2D view' : 'Switch to 3D view';
          };
          const pitchBtn = document.createElement('button');
          pitchBtn.type = 'button';
          pitchBtn.title = 'Switch to 3D view';
          pitchBtn.setAttribute('aria-label', 'Toggle 3D perspective view');
          pitchBtn.setAttribute('aria-pressed', 'false');
          pitchBtn.style.cssText = [
            'width:29px;height:29px;cursor:pointer;border:none;background:white;',
            'font-size:10px;font-weight:700;color:#333;letter-spacing:0;',
            'display:flex;align-items:center;justify-content:center;',
          ].join('');
          pitchBtn.textContent = '3D';
          pitchBtn.addEventListener('click', () => {
            const next = !is3D;
            map.easeTo({ pitch: next ? 50 : 0, duration: 600 });
            syncBtn(next);
          });
          // Keep button state in sync when pitch changes via compass or right-drag.
          map.on('pitchend', () => syncBtn(map.getPitch() > 5));
          const pitchContainer = document.createElement('div');
          pitchContainer.className = 'maplibregl-ctrl maplibregl-ctrl-group';
          pitchContainer.appendChild(pitchBtn);
          map.addControl(
            {
              onAdd: () => pitchContainer,
              onRemove: () => pitchContainer.remove(),
            },
            'top-right'
          );

          map.addControl(
            new maplibregl.TerrainControl({
              source: 'terrain-dem',
              exaggeration: 1.2,
            }),
            'top-right'
          );
        }

        map.on('load', () => {
          if (cancelled) return;
          try {
            // Satellite imagery — added now (hidden) so it sits below the route
            // layers; swapped in as the basemap during fly-through.
            if (maptilerKey.length > 0) {
              map.addSource('satellite', {
                type: 'raster',
                url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${maptilerKey}`,
                tileSize: 512,
              });
              map.addLayer({
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite',
                layout: { visibility: 'none' },
              });
            }

            // Add route
            map.addSource('route', { type: 'geojson', data: geojson });

            // Shadow / halo beneath the route line
            map.addLayer({
              id: 'route-shadow',
              type: 'line',
              source: 'route',
              filter: ['==', '$type', 'LineString'],
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#000000',
                'line-width': 8,
                'line-opacity': 0.15,
                'line-blur': 3,
              },
            });

            // Main route line
            map.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              filter: ['==', '$type', 'LineString'],
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#e63012',
                'line-width': 3.5,
                'line-opacity': 0.95,
              },
            });

            // Start/finish markers
            if (start) {
              new maplibregl.Marker({
                element: createMarkerEl('S', '#16a34a'),
                anchor: 'center',
              })
                .setLngLat([start.lng, start.lat])
                .setPopup(
                  new maplibregl.Popup({ offset: 20 }).setText(
                    `${raceName} — Start`
                  )
                )
                .addTo(map);
            }
            if (end) {
              new maplibregl.Marker({
                element: createMarkerEl('F', '#1d4ed8'),
                anchor: 'center',
              })
                .setLngLat([end.lng, end.lat])
                .setPopup(
                  new maplibregl.Popup({ offset: 20 }).setText(
                    `${raceName} — Finish`
                  )
                )
                .addTo(map);
            }

            // Checkpoint markers
            if (geojson.type === 'FeatureCollection') {
              for (const feature of geojson.features) {
                if (
                  feature.type === 'Feature' &&
                  feature.geometry?.type === 'Point' &&
                  (feature.properties as CheckpointProperties | null)?.type === 'checkpoint'
                ) {
                  const props = feature.properties as CheckpointProperties;
                  const [lng, lat] = (feature.geometry as import('geojson').Point).coordinates;
                  const name = props.name ?? 'CP';
                  let popupHtml = `<strong>${name}</strong>`;
                  if (props.cutoff) popupHtml += `<br>Cutoff: ${props.cutoff}`;
                  if (props.notes) popupHtml += `<br>${props.notes}`;
                  new maplibregl.Marker({
                    element: createMarkerEl(name, '#f97316'),
                    anchor: 'center',
                  })
                    .setLngLat([lng, lat])
                    .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml))
                    .addTo(map);
                }
              }
            }

            map.fitBounds(bounds as maplibregl.LngLatBoundsLike, {
              padding: 72,
              pitch: 0,
              duration: 0,
            });
            // Ensure canvas dimensions match the container after fitBounds may
            // have triggered a layout change.
            map.resize();

            // Fly-through animation — camera travels along the route.
            const routeCoords = getAllCoordinates(geojson);
            if (routeCoords.length >= 2) {
              const cumDists = buildCumulativeDistances(routeCoords);
              const totalDist = cumDists[cumDists.length - 1];
              // Ground speed ~5 m/s ≈ 1 min per km; floor at 30 s for short routes.
              const durationMs = Math.max(30_000, totalDist / 5);
              // Look-ahead: fixed 300 m gives stable bearing across route lengths.
              const lookAheadFrac = Math.min(300 / Math.max(totalDist, 1), 0.05);
              const flyPitch = hasDem ? 50 : 35;
              let flyRafId: number | null = null;
              let flyStartTime: number | null = null;

              const flyBtn = document.createElement('button');
              flyBtn.type = 'button';
              flyBtn.title = 'Fly through route';
              flyBtn.setAttribute('aria-label', 'Fly through route');
              flyBtn.setAttribute('aria-pressed', 'false');
              flyBtn.style.cssText = [
                'width:29px;height:29px;cursor:not-allowed;border:none;background:white;',
                'font-size:13px;font-weight:700;color:#333;letter-spacing:0;',
                'display:flex;align-items:center;justify-content:center;opacity:0.35;',
              ].join('');
              flyBtn.textContent = '\u25b6';
              flyBtn.disabled = true;

              const stopFly = () => {
                if (flyRafId !== null) {
                  cancelAnimationFrame(flyRafId);
                  flyRafId = null;
                }
                flyStartTime = null;
                flyBtn.textContent = '\u25b6';
                flyBtn.title = 'Fly through route';
                flyBtn.setAttribute('aria-pressed', 'false');
                flyBtn.style.color = '#333';
                // Guard against calling map methods after the map has been
                // removed (e.g. cleanup fires while a RAF frame is in flight).
                if (!cancelled && maptilerKey.length > 0) {
                  map.setLayoutProperty('satellite-layer', 'visibility', 'none');
                  map.setLayoutProperty('os-raster', 'visibility', 'visible');
                  if (hasDem) map.setLayoutProperty('hillshade', 'visibility', 'visible');
                }
              };

              const startFly = () => {
                flyStartTime = null;
                flyBtn.textContent = '\u25a0';
                flyBtn.title = 'Stop fly-through';
                flyBtn.setAttribute('aria-pressed', 'true');
                flyBtn.style.color = '#2563eb';
                if (maptilerKey.length > 0) {
                  map.setLayoutProperty('os-raster', 'visibility', 'none');
                  if (hasDem) map.setLayoutProperty('hillshade', 'visibility', 'none');
                  map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
                }

                const frame = (timestamp: number) => {
                  if (cancelled) { stopFly(); return; }
                  if (flyStartTime === null) flyStartTime = timestamp;
                  const elapsed = timestamp - flyStartTime;
                  const t = Math.min(elapsed / durationMs, 1);

                  const pos = sampleRoute(routeCoords, cumDists, totalDist, t);
                  const lookAheadT = Math.min(t + lookAheadFrac, 1);
                  const ahead = sampleRoute(routeCoords, cumDists, totalDist, lookAheadT);
                  const bearing =
                    ahead[0] !== pos[0] || ahead[1] !== pos[1]
                      ? bearingDeg(pos, ahead)
                      : map.getBearing();

                  // easeTo with a short linear duration blends successive frames
                  // smoothly instead of jumping to each position instantly.
                  map.easeTo({
                    center: pos as maplibregl.LngLatLike,
                    bearing,
                    pitch: flyPitch,
                    zoom: 15.5,
                    duration: 100,
                    easing: (x) => x,
                  });

                  if (t < 1) {
                    flyRafId = requestAnimationFrame(frame);
                  } else {
                    stopFly();
                  }
                };

                flyRafId = requestAnimationFrame(frame);
              };

              flyBtn.addEventListener('click', () => {
                if (flyRafId !== null) stopFly();
                else startFly();
              });

              const flyContainer = document.createElement('div');
              flyContainer.className = 'maplibregl-ctrl maplibregl-ctrl-group';
              flyContainer.appendChild(flyBtn);
              map.addControl(
                {
                  onAdd: () => flyContainer,
                  onRemove: () => { stopFly(); flyContainer.remove(); },
                },
                'top-right',
              );
            }
          } catch (overlayErr) {
            console.warn('Error adding route overlay:', overlayErr);
          }
          // Reveal the map regardless — basemap is usable even if overlay failed
          setStatus('ready');
        });

        // Track whether we've already fallen back from OS to OpenTopoMap.
        let osTilesFailed = false;
        map.on('error', (e) => {
          const msg =
            e && typeof e === 'object' && 'error' in e
              ? ((e as { error: Error }).error?.message ?? String(e))
              : String(e);
          console.warn('MapLibre error:', msg);
          // If the OS Maps API rejects a tile (403 Premium required), swap the
          // basemap to OpenTopoMap so the map stays usable without a premium key.
          if (hasOs && !osTilesFailed && msg.includes('os.uk')) {
            osTilesFailed = true;
            console.warn(
              'OS Maps API access denied — falling back to OpenTopoMap. ' +
              'Outdoor_3857 requires a premium OS Maps API plan.'
            );
            const src = map.getSource('os-raster') as maplibregl.RasterTileSource | undefined;
            src?.setTiles(['https://tile.opentopomap.org/{z}/{x}/{y}.png']);
          }
        });
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to load route map'
          );
          setStatus('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      try {
        mapRef.current?.remove();
      } catch {
        // Suppress WebGL errors thrown when in-flight tile callbacks fire
        // after the context is destroyed (common in React Strict Mode / HMR).
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceId]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700"
      style={{ height: 480 }}
    >
      {/* Inline styles are intentional: MapLibre adds .maplibregl-map { position: relative }
           to this element, which would override a Tailwind `absolute` class and collapse
           the container height. Inline styles have higher specificity and cannot be
           overridden by CSS classes. */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-100 dark:bg-slate-800">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Loading route map…
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-gray-50 px-6 text-center dark:bg-slate-900">
          <svg
            className="h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 20.25l-4.5-4.5m0 0L9 11.25m-4.5 4.5H18.75M15 3.75l4.5 4.5m0 0L15 12.75m4.5-4.5H5.25"
            />
          </svg>
          <p className="font-semibold text-gray-700 dark:text-slate-300">
            Route map unavailable
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {errorMsg}
          </p>
        </div>
      )}
    </div>
  );
}
