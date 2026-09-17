import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { CalendarEntry } from '@/lib/calendar';
import { gunzipSync } from 'zlib';

export const dynamic = 'force-static';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'calendar.json.gz');
    const buffer = await fs.readFile(filePath);
    const decompressed = gunzipSync(buffer).toString('utf8');
    const calendar = JSON.parse(decompressed) as CalendarEntry[];
    return NextResponse.json(calendar);
  } catch (error) { 
    return NextResponse.json(
      { error: 'Failed to load calendar data', detail: JSON.stringify(error) },
      { status: 500 }
    );
  }
}
