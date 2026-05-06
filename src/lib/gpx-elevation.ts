import type { GeoJSON, Feature, Geometry } from 'geojson';

/** A single point on the elevation profile: cumulative distance (km) + elevation (m). */
export interface ElevationPoint {
  d: number; // cumulative distance in km
  ele: number; // elevation in metres
}

export interface ElevationStats {
  gain: number; // total ascent in metres
  loss: number; // total descent in metres (positive value)
  minEle: number; // lowest elevation in metres
  maxEle: number; // highest elevation in metres
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Haversine distance in km between two [lng, lat] points. */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Recursively collect [lng, lat, ele] coords from any GeoJSON geometry. */
function collectCoords(geom: Geometry, out: [number, number, number][]): void {
  switch (geom.type) {
    case 'LineString':
      for (const c of geom.coordinates) {
        if (c.length >= 3 && c[2] != null) {
          out.push([c[0], c[1], c[2]]);
        }
      }
      break;
    case 'MultiLineString':
      for (const line of geom.coordinates) {
        for (const c of line) {
          if (c.length >= 3 && c[2] != null) {
            out.push([c[0], c[1], c[2]]);
          }
        }
      }
      break;
    case 'GeometryCollection':
      for (const g of geom.geometries) {
        collectCoords(g, out);
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all track coordinates carrying elevation from a GeoJSON object.
 * Returns an array of [lng, lat, ele] tuples (ele in metres).
 * Returns an empty array when no elevation data is present.
 */
export function extractTrackCoords(
  geojson: GeoJSON
): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (geojson.type === 'FeatureCollection') {
    for (const f of geojson.features) {
      collectCoords((f as Feature).geometry, out);
    }
  } else if (geojson.type === 'Feature') {
    collectCoords((geojson as Feature).geometry, out);
  } else {
    collectCoords(geojson as Geometry, out);
  }
  return out;
}

/**
 * Build a cumulative distance/elevation profile from track coordinates.
 * Downsamples to at most `maxPoints` points so SVG paths stay performant.
 */
export function buildElevationProfile(
  coords: [number, number, number][],
  maxPoints = 500
): ElevationPoint[] {
  if (coords.length === 0) return [];

  // Cumulative distances
  const raw: ElevationPoint[] = [{ d: 0, ele: coords[0][2] }];
  let cumDist = 0;
  for (let i = 1; i < coords.length; i++) {
    cumDist += haversineKm(
      [coords[i - 1][0], coords[i - 1][1]],
      [coords[i][0], coords[i][1]]
    );
    raw.push({ d: cumDist, ele: coords[i][2] });
  }

  // Downsample evenly if needed
  if (raw.length <= maxPoints) return raw;
  const step = (raw.length - 1) / (maxPoints - 1);
  const sampled: ElevationPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(raw[Math.round(i * step)]);
  }
  return sampled;
}

/**
 * Compute ascent/descent statistics from a profile.
 * Uses a 5 m noise threshold to avoid counting small measurement jitter.
 */
export function calcElevationStats(profile: ElevationPoint[]): ElevationStats {
  const THRESHOLD = 5;
  let gain = 0;
  let loss = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 1; i < profile.length; i++) {
    const diff = profile[i].ele - profile[i - 1].ele;
    if (diff > THRESHOLD) gain += diff;
    else if (diff < -THRESHOLD) loss += -diff;
    minEle = Math.min(minEle, profile[i].ele);
    maxEle = Math.max(maxEle, profile[i].ele);
  }
  if (profile.length > 0) {
    minEle = Math.min(minEle, profile[0].ele);
    maxEle = Math.max(maxEle, profile[0].ele);
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    minEle: Math.round(minEle),
    maxEle: Math.round(maxEle),
  };
}

/**
 * Choose a "nice" interval for axis gridlines given a data range.
 * Returns an interval in the same unit as the input.
 */
export function niceInterval(range: number, targetSteps = 4): number {
  const raw = range / targetSteps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const normed = raw / mag;
  let nice: number;
  if (normed < 1.5) nice = 1;
  else if (normed < 3.5) nice = 2;
  else if (normed < 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}
