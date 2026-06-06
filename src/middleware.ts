import { NextRequest, NextResponse } from 'next/server';

// Block requests originating from China (Vercel injects geo data at the edge).
// request.geo is undefined in local dev — the guard makes this a no-op locally.
export function middleware(request: NextRequest) {
  const country = request.geo?.country;
  if (country === 'CN') {
    return new NextResponse('Access denied.', { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Apply only to HTML page routes; skip static assets and result data files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|results/).*)',
  ],
};
