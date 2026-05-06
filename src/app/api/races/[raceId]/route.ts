import { NextResponse } from 'next/server';
import { loadAllRaces, loadRaceResults } from '@/lib/results-data';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const allRaces = await loadAllRaces().catch(
    () => ({}) as Record<string, unknown>
  );
  return Object.keys(allRaces).map((raceId) => ({ raceId }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ raceId: string }> }
) {
  const { raceId } = await params;

  try {
    const allRaces = await loadAllRaces();
    if (!allRaces[raceId]) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    const data = await loadRaceResults(raceId);
    return NextResponse.json(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    console.error('Failed to load race data for API route', raceId, error);
    return NextResponse.json(
      { error: 'Failed to load race data' },
      { status: 500 }
    );
  }
}
