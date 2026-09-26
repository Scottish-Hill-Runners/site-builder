/**
 * Browser-side GPX → GeoJSON route processing, ported from shr-admin's
 * `src/lib/gpx-processing.ts` but using the native `DOMParser` (available in
 * the browser) instead of `@xmldom/xmldom`, since this only ever runs client-side.
 */

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

type LatLon = { lat: number; lon: number };

/** A checkpoint to embed as a GeoJSON Point feature. */
export type CheckpointInput = {
  trackPointIndex: number;
  name: string;
  cutoff: string;
  notes: string;
};

export type RouteGeoJsonResult = {
  geojson: string;
  pointsBefore: number;
  pointsAfter: number;
};

/** Number of `<trkpt>` (or `<rtept>` if no track points exist) elements, for a quick "N points loaded" summary. */
export function countGpxTrackPoints(gpxText: string): number {
  const trkptCount = (gpxText.match(/<trkpt\b/gi) ?? []).length;
  if (trkptCount > 0) return trkptCount;
  return (gpxText.match(/<rtept\b/gi) ?? []).length;
}

/**
 * Perpendicular distance from point P to the line segment A→B, in metres.
 * Uses a planar cosine-corrected approximation that is accurate to better
 * than 0.1% for distances under ~500 km.
 */
function perpendicularDistanceM(p: LatLon, a: LatLon, b: LatLon, cosLat: number): number {
  const scale = EARTH_RADIUS_M * DEG_TO_RAD;
  const px = (p.lon - a.lon) * cosLat * scale;
  const py = (p.lat - a.lat) * scale;
  const bx = (b.lon - a.lon) * cosLat * scale;
  const by = (b.lat - a.lat) * scale;

  const lenSq = bx * bx + by * by;
  if (lenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const dx = px - t * bx;
  const dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Iterative Douglas-Peucker polyline simplification using an explicit stack
 * to avoid call-stack overflows on very long tracks.
 *
 * Returns a boolean[] where `true` means the corresponding point is kept.
 */
function douglasPeucker(points: LatLon[], epsilonM: number, cosLat: number): boolean[] {
  const n = points.length;
  const keep = new Array<boolean>(n).fill(false);

  if (n === 0) return keep;
  if (n === 1) {
    keep[0] = true;
    return keep;
  }

  const stack: Array<[number, number]> = [[0, n - 1]];
  keep[0] = true;
  keep[n - 1] = true;

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;

    let maxDist = 0;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceM(points[i], points[start], points[end], cosLat);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist >= epsilonM) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  return keep;
}

function parsePointElements(doc: Document): Element[] {
  const allElements = doc.getElementsByTagName('*');
  const trkptElements: Element[] = [];
  const rteptElements: Element[] = [];

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    const localName = element.localName?.toLowerCase() ?? element.tagName.toLowerCase();
    if (localName === 'trkpt') trkptElements.push(element);
    if (localName === 'rtept') rteptElements.push(element);
  }

  // Prefer recorded track points when present; otherwise fall back to route points.
  return trkptElements.length > 0 ? trkptElements : rteptElements;
}

function r6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Converts a GPX file into a single GeoJSON FeatureCollection containing:
 *   - A `LineString` feature for the simplified route (`properties.type = "route"`)
 *   - One `Point` feature per checkpoint (`properties.type = "checkpoint"`)
 *
 * All coordinates are `[lon, lat, ele]` triples rounded to 6 decimal places.
 * Segment-aware Douglas-Peucker is applied so checkpoint track points are
 * guaranteed to survive smoothing.
 */
export function gpxToRouteGeoJson(
  gpx: string,
  epsilonM: number,
  checkpoints: CheckpointInput[]
): RouteGeoJsonResult {
  type TrkPt = { lat: number; lon: number; ele: number };

  const doc = new DOMParser().parseFromString(gpx, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('GPX file could not be parsed');
  }
  const nodeList = parsePointElements(doc);

  const allTrkpts: TrkPt[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i];
    const lat = parseFloat(node.getAttribute('lat') ?? '0');
    const lon = parseFloat(node.getAttribute('lon') ?? '0');
    const eleEl = node.getElementsByTagName('ele')[0];
    const ele = eleEl ? parseFloat(eleEl.textContent ?? '0') : 0;
    allTrkpts.push({ lat, lon, ele });
  }

  const pointsBefore = allTrkpts.length;

  let routeCoords: [number, number, number][];

  if (allTrkpts.length < 2 || epsilonM <= 0) {
    routeCoords = allTrkpts.map((p) => [r6(p.lon), r6(p.lat), r6(p.ele)]);
  } else {
    const checkpointIndices = checkpoints
      .map((c) => c.trackPointIndex)
      .filter((i) => i >= 0 && i < allTrkpts.length);

    const splits = Array.from(new Set([0, ...checkpointIndices, allTrkpts.length - 1])).sort(
      (a, b) => a - b
    );

    const latLons: LatLon[] = allTrkpts.map(({ lat, lon }) => ({ lat, lon }));
    const avgLat = allTrkpts.reduce((s, p) => s + p.lat, 0) / allTrkpts.length;
    const cosLat = Math.cos(avgLat * DEG_TO_RAD);

    const keptIndices = new Set<number>();
    for (let si = 0; si < splits.length - 1; si++) {
      const start = splits[si];
      const end = splits[si + 1];
      const keep = douglasPeucker(latLons.slice(start, end + 1), epsilonM, cosLat);
      for (let i = 0; i < keep.length; i++) {
        if (keep[i]) keptIndices.add(start + i);
      }
    }

    routeCoords = Array.from(keptIndices)
      .sort((a, b) => a - b)
      .map((i) => [r6(allTrkpts[i].lon), r6(allTrkpts[i].lat), r6(allTrkpts[i].ele)]);
  }

  const pointsAfter = routeCoords.length;

  const routeFeature = {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates: routeCoords },
    properties: { type: 'route' },
  };

  const checkpointFeatures = checkpoints.map((cp) => {
    const pt = allTrkpts[cp.trackPointIndex] ?? allTrkpts[0];
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [r6(pt.lon), r6(pt.lat), r6(pt.ele)] as [number, number, number],
      },
      properties: {
        type: 'checkpoint',
        name: cp.name,
        cutoff: cp.cutoff,
        notes: cp.notes,
      },
    };
  });

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: [routeFeature, ...checkpointFeatures],
  };

  return { geojson: JSON.stringify(featureCollection), pointsBefore, pointsAfter };
}
