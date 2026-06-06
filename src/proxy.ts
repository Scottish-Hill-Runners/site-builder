import { NextRequest, NextResponse } from 'next/server';

// Block requests originating from China (Vercel injects geo data as a header at the edge).
// The header is absent in local dev — the guard makes this a no-op locally.
export function proxy(request: NextRequest) {
  const country = request.headers.get('x-vercel-ip-country');
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
