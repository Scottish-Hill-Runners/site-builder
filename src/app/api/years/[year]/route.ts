import { NextResponse } from 'next/server';
import { loadAvailableYears, loadYearResults } from '@/lib/results-data';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const years = await loadAvailableYears().catch(() => [] as string[]);
  return years.map((year) => ({ year }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year } = await params;

  try {
    const results = await loadYearResults(year);
    return NextResponse.json(results);
  } catch (error) {
    if ((error as Error).message === 'Invalid year') {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Year not found' }, { status: 404 });
    }

    console.error('Failed to load year results for API route', year, error);
    return NextResponse.json(
      { error: 'Failed to load year results' },
      { status: 500 }
    );
  }
}
