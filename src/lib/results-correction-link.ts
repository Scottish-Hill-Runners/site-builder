import type { RaceResult } from '@/types/datatable';

const RESULTS_EDIT_BASE = 'https://admin.scottishhillrunners.uk/results';

export function normalizeResultYear(rawYear: string): string | null {
  const match = rawYear.match(/\d{4}/);
  return match ? match[0] : null;
}

export function buildResultsEditUrl(raceId: string, year: string): string {
  return `${RESULTS_EDIT_BASE}/${encodeURIComponent(raceId)}/${encodeURIComponent(year)}`;
}

export function getLatestResultYear(results: RaceResult[]): string | null {
  let latestYear: string | null = null;

  for (const row of results) {
    const year = normalizeResultYear(row.year);
    if (year && (latestYear === null || year > latestYear)) latestYear = year;
  }

  return latestYear;
}
