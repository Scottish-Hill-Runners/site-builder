import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export interface CalendarEntry {
  Date: string;
  raceName: string;
  raceId?: string;
  distance?: number;
  climb?: number;
}

let cachedCalendarEntries: CalendarEntry[] | null = null;

async function readCalendarEntriesFromFile(): Promise<CalendarEntry[]> {
  const filePath = path.join(process.cwd(), 'public', 'calendar.json.gz');
  const compressed = await fs.readFile(filePath);
  const file = gunzipSync(compressed).toString('utf8');
  const entries = JSON.parse(file) as CalendarEntry[];

  if (!Array.isArray(entries)) {
    throw new Error('calendar.json.gz format is invalid');
  }

  return entries;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseRaceDate(value: string): Date | null {
  const raceDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(raceDate.getTime())) {
    return null;
  }
  return raceDate;
}

export async function getUpcomingCalendarEntries(
  daysAhead: number
): Promise<CalendarEntry[]> {
  const maxDays = Number.isFinite(daysAhead)
    ? Math.max(0, Math.floor(daysAhead))
    : 0;

  try {
    if (cachedCalendarEntries === null) {
      cachedCalendarEntries = await readCalendarEntriesFromFile();
    }

    const today = startOfToday();
    const end = new Date(today);
    end.setDate(end.getDate() + maxDays);

    return cachedCalendarEntries.filter((entry) => {
      const raceDate = parseRaceDate(entry.Date);
      return raceDate !== null && raceDate >= today && raceDate <= end;
    });
  } catch (error) {
    console.warn('Could not load calendar data:', error);
    return [];
  }
}
