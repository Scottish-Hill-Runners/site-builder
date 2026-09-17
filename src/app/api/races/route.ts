import { loadAllRaces } from '@/lib/results-data';
import { NextResponse } from 'next/server';
export const dynamic = 'force-static';

export async function GET() {
    try {
      const allRaces = await loadAllRaces();
      return NextResponse.json(allRaces);
    } catch (error) { 
      return NextResponse.json(
        { error: 'Failed to load race data', detail: JSON.stringify(error) },
        { status: 500 }
      );
    }
}
