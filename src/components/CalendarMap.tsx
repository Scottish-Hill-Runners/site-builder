'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

interface CalendarMapProps {
  entries: {
    raceId?: string;
    raceName: string;
    latitude?: number;
    longitude?: number;
  }[];
}

export default function CalendarMap({ entries }: CalendarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const osKey = process.env.NEXT_PUBLIC_OS_MAPS_API_KEY ?? '';

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const hasOs = osKey.length > 0;

    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
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
      },
      layers: [
        {
          id: 'os-raster',
          type: 'raster',
          source: 'os-raster',
        },
      ],
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [-4.2026, 56.4907], // center of scotland
      zoom: 6,
      minZoom: 5,
      maxZoom: 14,
      maxBounds: [
        [-10.76, 49.52],
        [2.0, 61.4],
      ],
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const mappedEntries = entries.filter((e) => e.latitude && e.longitude && e.raceId);

    mappedEntries.forEach((entry) => {
      const el = document.createElement('a');
      el.href = `/races/${encodeURIComponent(entry.raceId!)}`;
      el.title = entry.raceName;
      // MapLibre sometimes swallows clicks on markers, so explicitly navigate
      el.addEventListener('click', (e) => {
        // Only if it wasn't intercepted by something else
        if (!e.defaultPrevented) {
          window.location.href = el.href;
        }
      });
      el.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: #ef4444; border: 2px solid white;
        display: block;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        pointer-events: auto;
      `;

      new maplibregl.Marker({ element: el })
        .setLngLat([entry.longitude!, entry.latitude!])
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [entries, osKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800">
      <div style={{ height: '600px', width: '100%' }} ref={containerRef} />
    </div>
  );
}