import type { RaceResult } from '@/types/datatable';

const RESULTS_EDIT_BASE = 'https://admin.scottishhillrunners.uk/results';

export function buildResultsEditUrl(raceId: string, year: string): string {
  return `${RESULTS_EDIT_BASE}/${encodeURIComponent(raceId)}/${encodeURIComponent(year)}`;
}

export function getLatestResultYear(results: RaceResult[]): string | null {
  let latestYear: string | null = null;

  for (const row of results) {
    const year = row.year;
    if (year && (latestYear === null || year > latestYear)) latestYear = year;
  }

  return latestYear;
}
