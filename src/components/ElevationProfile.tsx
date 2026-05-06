'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { kmToMiles, mToFeet } from '@/lib/units';
import { niceInterval } from '@/lib/gpx-elevation';

interface ElevationProfileProps {
  raceId: string;
  raceName: string;
}

interface ElevationChartData {
  area: string;
  line: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  minEle: number;
  maxEle: number;
  totalDistKm: number;
  gain: number;
  loss: number;
  W: number;
  H: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
}

export default function ElevationProfile({
  raceId,
  raceName,
}: ElevationProfileProps) {
  const { imperial } = useUnits();
  const [data, setData] = useState<ElevationChartData | null | false>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/results/${encodeURIComponent(raceId)}-elevation.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ElevationChartData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  // No elevation data for this race — render nothing
  if (data === false) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
        Elevation profile
      </h3>
      {data === null ? (
        <div className="flex h-[200px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
        </div>
      ) : (
        <LoadedChart data={data} raceName={raceName} imperial={imperial} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component — only rendered once data is loaded, so all derived values
// are computed synchronously with no loading-state branching.
// ---------------------------------------------------------------------------
function LoadedChart({
  data,
  raceName,
  imperial,
}: {
  data: ElevationChartData;
  raceName: string;
  imperial: boolean;
}) {
  const {
    area,
    line,
    startX,
    startY,
    endX,
    endY,
    minEle,
    maxEle,
    totalDistKm,
    gain,
    loss,
    W,
    H,
    padTop,
    padBottom,
    padLeft,
    padRight,
  } = data;

  const plotH = H - padTop - padBottom;
  const plotW = W - padLeft - padRight;
  const baseline = padTop + plotH;

  // Unit helpers
  const toDisplayEle = (m: number) =>
    imperial ? Math.round(mToFeet(m)) : Math.round(m);
  const eleUnit = imperial ? 'ft' : 'm';
  const displayTotalDist = imperial ? kmToMiles(totalDistKm) : totalDistKm;
  const distUnit = imperial ? 'mi' : 'km';

  // Reconstruct coordinate transforms (same formula as build script)
  const eleRange = maxEle - minEle || 1;
  const toSvgY = (rawEle: number) =>
    padTop + plotH - ((rawEle - minEle) / eleRange) * plotH;
  const toSvgX = (distKm: number) => padLeft + (distKm / totalDistKm) * plotW;

  // Y gridlines — computed in display units, converted back to raw for positioning
  const { gridLines, distTicks } = useMemo(() => {
    const displayMin = toDisplayEle(minEle);
    const displayMax = toDisplayEle(maxEle);
    const yInterval = niceInterval(displayMax - displayMin, 4);
    const yStart = Math.ceil(displayMin / yInterval) * yInterval;
    const gl: number[] = [];
    for (let v = yStart; v <= displayMax; v += yInterval) gl.push(v);

    const xInterval = niceInterval(displayTotalDist, 5);
    const dt: number[] = [];
    for (let v = 0; v <= displayTotalDist + xInterval * 0.01; v += xInterval) {
      dt.push(Math.round(v * 10) / 10);
    }
    return { gridLines: gl, distTicks: dt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minEle, maxEle, totalDistKm, imperial]);

  // Convert a display-unit elevation back to raw metres for SVG positioning
  const displayEleToSvgY = (displayEle: number) => {
    const rawEle = imperial ? displayEle / 3.28084 : displayEle;
    return toSvgY(rawEle);
  };

  const gradientId = `elev-fill-${encodeURIComponent(data.totalDistKm)}`;
  const clipId = `elev-clip-${encodeURIComponent(data.totalDistKm)}`;

  const statItems = [
    { label: 'Total ascent', value: `↑ ${toDisplayEle(gain)} ${eleUnit}` },
    { label: 'Total descent', value: `↓ ${toDisplayEle(loss)} ${eleUnit}` },
    { label: 'Highest point', value: `${toDisplayEle(maxEle)} ${eleUnit}` },
    { label: 'Lowest point', value: `${toDisplayEle(minEle)} ${eleUnit}` },
  ];

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          role="img"
          aria-label={`Elevation profile for ${raceName}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e63012" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#e63012" stopOpacity="0.03" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Y gridlines + labels */}
          {gridLines.map((v) => {
            const y = displayEleToSvgY(v);
            return (
              <g key={v}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeDasharray="3 3"
                  className="text-gray-200 dark:text-slate-700"
                />
                <text
                  x={padLeft - 5}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  className="fill-gray-400 dark:fill-slate-500"
                >
                  {v}
                </text>
              </g>
            );
          })}

          {/* Y-axis unit */}
          <text
            x={padLeft - 5}
            y={padTop - 6}
            textAnchor="end"
            fontSize="9"
            className="fill-gray-400 dark:fill-slate-500"
          >
            {eleUnit}
          </text>

          {/* X ticks + labels */}
          {distTicks.map((v) => {
            const rawKm = imperial ? v / 0.621371 : v;
            const x = toSvgX(rawKm);
            if (x < padLeft - 1 || x > W - padRight + 1) return null;
            return (
              <g key={v}>
                <line
                  x1={x}
                  y1={baseline}
                  x2={x}
                  y2={baseline + 4}
                  stroke="currentColor"
                  strokeWidth="0.8"
                  className="text-gray-300 dark:text-slate-600"
                />
                <text
                  x={x}
                  y={baseline + 13}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-gray-400 dark:fill-slate-500"
                >
                  {v}
                </text>
              </g>
            );
          })}

          {/* X-axis unit */}
          <text
            x={W - padRight + 4}
            y={baseline + 13}
            fontSize="9"
            className="fill-gray-400 dark:fill-slate-500"
          >
            {distUnit}
          </text>

          {/* Baseline */}
          <line
            x1={padLeft}
            y1={baseline}
            x2={W - padRight}
            y2={baseline}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-gray-300 dark:text-slate-600"
          />

          {/* Pre-computed area fill + stroke */}
          <path
            d={area}
            fill={`url(#${gradientId})`}
            clipPath={`url(#${clipId})`}
          />
          <path
            d={line}
            fill="none"
            stroke="#e63012"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clipId})`}
          />

          {/* Start marker */}
          <circle
            cx={startX}
            cy={startY}
            r="5"
            fill="#16a34a"
            stroke="white"
            strokeWidth="1.5"
          />
          <text
            x={startX + 8}
            y={startY}
            dominantBaseline="middle"
            fontSize="9"
            fontWeight="700"
            fill="#16a34a"
          >
            S
          </text>

          {/* Finish marker */}
          <circle
            cx={endX}
            cy={endY}
            r="5"
            fill="#1d4ed8"
            stroke="white"
            strokeWidth="1.5"
          />
          <text
            x={endX - 8}
            y={endY}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="9"
            fontWeight="700"
            fill="#1d4ed8"
          >
            F
          </text>
        </svg>
      </div>

      {/* Stats strip */}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {statItems.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
          >
            <dt className="text-xs text-gray-500 dark:text-slate-400">
              {label}
            </dt>
            <dd className="mt-0.5 font-semibold text-gray-900 dark:text-slate-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
