export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export function mToFeet(m: number): number {
  return m * 3.28084;
}

export function formatDistance(
  km: number | null | undefined,
  imperial: boolean
): string {
  if (km == null) return '—';
  if (imperial) {
    return `${kmToMiles(km).toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatClimb(
  m: number | null | undefined,
  imperial: boolean
): string {
  if (m == null) return '—';
  if (imperial) {
    return `${Math.round(mToFeet(m) / 10) * 10} ft`;
  }
  return `${m} m`;
}
