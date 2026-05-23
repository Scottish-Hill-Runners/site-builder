import {
  buildElevationProfile,
  calcElevationStats,
  type ElevationPoint,
} from '@/lib/gpx-elevation';
import type { ElevationChartData } from '@/types/datatable';

// ---------------------------------------------------------------------------
// Constants (match the visual design in ElevationProfile.tsx)
// ---------------------------------------------------------------------------
const W = 800;
const H = 200;
const PAD = { top: 16, bottom: 32, left: 52, right: 16 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASELINE = PAD.top + PLOT_H;

// ---------------------------------------------------------------------------
// GeoJSON parsing — extracts [lon, lat, ele] triples from the LineString feature
// ---------------------------------------------------------------------------
function parseGeoJsonCoords(geojsonStr: string): [number, number, number][] {
  try {
    const geojson = JSON.parse(geojsonStr);
    for (const feature of geojson?.features ?? []) {
      if (feature?.geometry?.type === 'LineString') {
        const raw: unknown[] = feature.geometry.coordinates;
        if (!Array.isArray(raw)) continue;
        const coords: [number, number, number][] = [];
        for (const c of raw) {
          if (!Array.isArray(c) || c.length < 3) continue;
          const lon = c[0] as number, lat = c[1] as number, ele = c[2] as number;
          if (isFinite(lon) && isFinite(lat) && isFinite(ele))
            coords.push([lon, lat, ele]);
        }
        return coords;
      }
    }
  } catch {}
  return [];
}

// ---------------------------------------------------------------------------
// SVG path builders — Catmull-Rom → cubic Bézier for smooth curves
// ---------------------------------------------------------------------------
function fmt(x: number): string {
  return x.toFixed(2);
}

function buildPaths(
  profile: ElevationPoint[],
  totalDist: number,
  minEle: number,
  maxEle: number
): {
  area: string;
  line: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  const eleRange = maxEle - minEle || 1;
  const toX = (d: number) => PAD.left + (d / totalDist) * PLOT_W;
  const toY = (e: number) =>
    PAD.top + PLOT_H - ((e - minEle) / eleRange) * PLOT_H;

  const xs = profile.map((p) => toX(p.d));
  const ys = profile.map((p) => toY(p.ele));

  const tension = 0.5;
  let linePath = `M ${fmt(xs[0])},${fmt(ys[0])}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const p0 = i === 0 ? [xs[0], ys[0]] : [xs[i - 1], ys[i - 1]];
    const p1 = [xs[i], ys[i]];
    const p2 = [xs[i + 1], ys[i + 1]];
    const p3 = i + 2 < xs.length ? [xs[i + 2], ys[i + 2]] : p2;
    const cp1x = p1[0] + (tension * (p2[0] - p0[0])) / 6;
    const cp1y = p1[1] + (tension * (p2[1] - p0[1])) / 6;
    const cp2x = p2[0] - (tension * (p3[0] - p1[0])) / 6;
    const cp2y = p2[1] - (tension * (p3[1] - p1[1])) / 6;
    linePath += ` C ${fmt(cp1x)},${fmt(cp1y)} ${fmt(cp2x)},${fmt(cp2y)} ${fmt(p2[0])},${fmt(p2[1])}`;
  }

  const areaPath = `${linePath} L ${fmt(xs[xs.length - 1])},${fmt(BASELINE)} L ${fmt(xs[0])},${fmt(BASELINE)} Z`;

  return {
    area: areaPath,
    line: linePath,
    startX: toX(0),
    startY: toY(profile[0].ele),
    endX: toX(totalDist),
    endY: toY(profile[profile.length - 1].ele),
  };
}

// ---------------------------------------------------------------------------
// Pure entry point — called by build-race-results.ts for each race with a GeoJSON route
// ---------------------------------------------------------------------------
export function buildElevationChartData(
  geojsonStr: string
): ElevationChartData | null {
  const coords = parseGeoJsonCoords(geojsonStr);
  if (coords.length === 0) return null;

  const profile = buildElevationProfile(coords);
  const stats = calcElevationStats(profile);
  const totalDistKm = Math.round((profile.at(-1)?.d ?? 0) * 100) / 100;

  if (stats.maxEle - stats.minEle < 1) return null;

  const paths = buildPaths(profile, totalDistKm, stats.minEle, stats.maxEle);

  return {
    ...paths,
    minEle: stats.minEle,
    maxEle: stats.maxEle,
    totalDistKm,
    gain: stats.gain,
    loss: stats.loss,
    W,
    H,
    padTop: PAD.top,
    padBottom: PAD.bottom,
    padLeft: PAD.left,
    padRight: PAD.right,
  };
}
