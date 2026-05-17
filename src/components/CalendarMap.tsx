'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance, formatClimb } from '@/lib/units';

interface CalendarMapProps {
  entries: {
    Date?: string;
    raceId?: string;
    raceName: string;
    distance?: number;
    climb?: number;
    latitude?: number;
    longitude?: number;
    championships?: { [slug: string]: string };
  }[];
}

export default function CalendarMap({ entries }: CalendarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { imperial } = useUnits();

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
      const el = document.createElement('button');
      el.type = 'button';
      el.title = entry.raceName;
      el.setAttribute('aria-label', entry.raceName);
      el.style.cssText = `
        width: 16px; height: 16px; border-radius: 50%;
        background: #ef4444; border: 2px solid white;
        display: block; padding: 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        pointer-events: auto;
      `;

      const popupContent = document.createElement('div');
      popupContent.style.cssText = `
        min-width: 180px;
        max-width: 240px;
        padding: 2px 0;
      `;

      const popupTitle = document.createElement('div');
      popupTitle.textContent = entry.raceName;
      popupTitle.style.cssText = `
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.3;
        color: #0f172a;
        margin-bottom: 8px;
      `;

      const popupDate = document.createElement('div');
      popupDate.style.cssText = `
        font-size: 0.78rem;
        font-weight: 600;
        color: #475569;
        margin-bottom: 8px;
      `;
      if (entry.Date) {
        const parsed = new Date(entry.Date);
        const hasValidDate = !Number.isNaN(parsed.getTime());
        popupDate.textContent = hasValidDate
          ? parsed.toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : entry.Date;
      }

      const details = document.createElement('div');
      details.style.cssText = `
        font-size: 0.82rem;
        line-height: 1.4;
        color: #334155;
        margin-bottom: 10px;
      `;

      const detailParts: string[] = [];
      if (entry.distance != null) {
        detailParts.push(formatDistance(entry.distance, imperial));
      }
      if (entry.climb != null) {
        detailParts.push(formatClimb(entry.climb, imperial));
      }
      details.textContent = detailParts.length > 0 ? detailParts.join(' • ') : 'Distance and climb not listed';

      let championshipsWrap: HTMLDivElement | null = null;
      const championshipNames = Object.values(entry.championships ?? {}).filter(Boolean);
      if (championshipNames.length > 0) {
        const wrap = document.createElement('div');
        wrap.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          margin-bottom: 10px;
        `;

        const championshipLabel = document.createElement('div');
        championshipLabel.textContent = 'Championships';
        championshipLabel.style.cssText = `
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #475569;
        `;

        const chipsRow = document.createElement('div');
        chipsRow.style.cssText = `
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        `;

        wrap.appendChild(championshipLabel);

        championshipNames.forEach((name) => {
          const chip = document.createElement('span');
          chip.textContent = name;
          chip.style.cssText = `
            display: inline-block;
            background: #e2e8f0;
            color: #0f172a;
            border-radius: 9999px;
            padding: 2px 8px;
            font-size: 0.72rem;
            font-weight: 600;
            line-height: 1.3;
          `;
          chipsRow.appendChild(chip);
        });

        wrap.appendChild(chipsRow);

        championshipsWrap = wrap;
      }

      const popupLink = document.createElement('a');
      popupLink.href = `/races/${encodeURIComponent(entry.raceId!)}`;
      popupLink.textContent = 'View race details';
      popupLink.style.cssText = `
        display: inline-block;
        background: #2563eb;
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.85rem;
        line-height: 1;
        padding: 8px 10px;
        border-radius: 8px;
      `;
      popupLink.setAttribute('aria-label', `View details for ${entry.raceName}`);

      popupContent.appendChild(popupTitle);
      if (entry.Date) {
        popupContent.appendChild(popupDate);
      }
      popupContent.appendChild(details);
      if (championshipsWrap) {
        popupContent.appendChild(championshipsWrap);
      }
      popupContent.appendChild(popupLink);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: true,
        offset: 16,
        maxWidth: '260px',
      }).setDOMContent(popupContent);

      new maplibregl.Marker({ element: el })
        .setLngLat([entry.longitude!, entry.latitude!])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [entries, osKey, imperial]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-800">
      <div style={{ height: '600px', width: '100%' }} ref={containerRef} />
    </div>
  );
}