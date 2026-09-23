'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';

interface RouteMapProps {
  raceName: string;
  geojson: GeoJSON;
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

function getBounds(geojson: GeoJSON): [[number, number], [number, number]] | null {
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

export default function RouteMap({ raceName, geojson }: RouteMapProps) {
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
        const bounds = getBounds(geojson);
        const { start, end } = getEndpoints(geojson);

        if (!bounds) throw new Error('No route coordinates found in GeoJSON file');
        if (!containerRef.current || cancelled) return;

        // Derive initial centre from the route bounding box so the first tile
        // requests land over the route, not at the default world origin.
        const sw = bounds[0];
        const ne = bounds[1];
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
          maxBounds: [ // limit to UK
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
            // Add route
            map.addSource('route', { type: 'geojson', data: geojson });

            // Shadow / halo beneath the route line
            map.addLayer({
              id: 'route-shadow',
              type: 'line',
              source: 'route',
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
                  new maplibregl.Popup({ offset: 20 }).setHTML(
                    `<span style="color:#1f2937">${raceName} \u2014 Start</span>`
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
                  new maplibregl.Popup({ offset: 20 }).setHTML(
                    `<span style="color:#1f2937">${raceName} \u2014 Finish</span>`
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
                  const [lng, lat] = feature.geometry.coordinates;
                  const name = props.name ?? 'CP';
                  let popupHtml = `<div style="color:#1f2937;font-size:13px"><strong>${name}</strong>`;
                  if (props.cutoff) popupHtml += `<br>Cutoff: ${props.cutoff}`;
                  if (props.notes) popupHtml += `<br>${props.notes}`;
                  popupHtml += '</div>';
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

            map.fitBounds(bounds, {
              padding: 72,
              pitch: 0,
              duration: 0,
            });
            // Ensure canvas dimensions match the container after fitBounds may
            // have triggered a layout change.
            map.resize();

          } catch (overlayErr) {
            console.warn('Error adding route overlay:', overlayErr);
          }
          // Reveal the map regardless — base map is usable even if overlay failed
          setStatus('ready');
        });

        // Track whether we've already fallen back from OS to OpenTopoMap.
        let osTilesFailed = false;
        map.on('error', (e) => {
          const msg =
            e && typeof e === 'object' && 'error' in e
              ? (e.error?.message ?? String(e))
              : String(e);
          console.warn('MapLibre error:', msg);
          // If the OS Maps API rejects a tile (403 Premium required), swap the
          // base map to OpenTopoMap so the map stays usable without a premium key.
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
  }, [geojson, raceName]);

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
