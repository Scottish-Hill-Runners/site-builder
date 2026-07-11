import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AllRaceData, RaceData, RaceResult } from '@/types/datatable';

export type RunnerNameEntry = {
  name: string;
  count: number;
};

export type RecentRaceLinkTarget = {
  raceId: string;
  title: string;
  year: string;
};

function resultsPath(fileName: string): string {
  return path.join(process.cwd(), 'public', 'results', fileName);
}

async function readJsonGzip<T>(fileName: string): Promise<T> {
  const buffer = await fs.readFile(resultsPath(fileName));
  const decompressed = gunzipSync(buffer).toString('utf8');
  return JSON.parse(decompressed) as T;
}

export async function loadAllRaces(): Promise<AllRaceData> {
  return await readJsonGzip<AllRaceData>('races.json.gz');
}

export type CalendarEntry = {
  Date: string;
  raceName: string;
  raceId?: string;
  distance?: number;
  climb?: number;
  latitude?: number;
  longitude?: number;
  championships?: { [slug: string]: string };
};

export async function loadCalendar(): Promise<CalendarEntry[]> {
  const buffer = await fs.readFile(path.join(process.cwd(), 'public', 'calendar.json.gz'));
  const decompressed = gunzipSync(buffer).toString('utf8');
  return JSON.parse(decompressed) as CalendarEntry[];
}

export async function loadRaceResults(raceId: string): Promise<RaceData> {
  const safeRaceId = raceId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeRaceId) {
    throw new Error('Invalid race id');
  }

  return readJsonGzip<RaceData>(`${safeRaceId}.json.gz`);
}

export async function loadAvailableYears(): Promise<string[]> {
  const files = await fs.readdir(resultsPath(''));

  return files
    .map((fileName) => {
      const match = fileName.match(/^(\d{4})\.json\.gz$/);
      return match ? match[1] : null;
    })
    .filter((year): year is string => year !== null)
    .sort((a, b) => b.localeCompare(a));
}

export async function loadYearResults(year: string): Promise<RaceResult[]> {
  if (!/^\d{4}$/.test(year)) {
    throw new Error('Invalid year');
  }

  return readJsonGzip<RaceResult[]>(`${year}.json.gz`);
}

export async function loadRunnerBatch(batch: number): Promise<RaceResult[]> {
  if (!Number.isInteger(batch) || batch < 0 || batch > 99) {
    throw new Error('Invalid runner batch');
  }

  return readJsonGzip<RaceResult[]>(`R-${batch}.json.gz`);
}

export async function loadRunnerNames(): Promise<RunnerNameEntry[]> {
  return await readJsonGzip<RunnerNameEntry[]>('runners.json.gz');
}

export async function loadRecentRaceLinkTargets(
  now: Date = new Date()
): Promise<RecentRaceLinkTarget[]> {
  const currentYear = String(now.getFullYear());
  const previousYear = String(now.getFullYear() - 1);

  const [allRaces, currentYearResults, previousYearResults] = await Promise.all([
    loadAllRaces(),
    loadYearResults(currentYear).catch(() => [] as RaceResult[]),
    loadYearResults(previousYear).catch(() => [] as RaceResult[]),
  ]);

  const currentRaceIds = new Set(currentYearResults.map((result) => result.raceId));
  const previousRaceIds = new Set(
    previousYearResults.map((result) => result.raceId)
  );

  return Object.entries(allRaces)
    .map(([raceId, race]) => {
      if (currentRaceIds.has(raceId)) {
        return {
          raceId,
          title: race.title ?? raceId,
          year: currentYear,
        };
      }

      if (previousRaceIds.has(raceId)) {
        return {
          raceId,
          title: race.title ?? raceId,
          year: previousYear,
        };
      }

      return null;
    })
    .filter((entry): entry is RecentRaceLinkTarget => entry !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}
