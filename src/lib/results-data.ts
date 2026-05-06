import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AllRaceData, RaceData, RaceResult } from '@/types/datatable';

export type RunnerNameEntry = {
  name: string;
  count: number;
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
