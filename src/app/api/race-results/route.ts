import { NextResponse } from 'next/server';
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(
    {
      error:
        'API routes are disabled in static export. Use /results/*-results.json.gz files.',
    },
    { status: 410 }
  );
}
