import { NextResponse } from 'next/server';
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(
    {
      error:
        'API routes are disabled in static export. Use /championships.json.gz.',
    },
    { status: 410 }
  );
}
