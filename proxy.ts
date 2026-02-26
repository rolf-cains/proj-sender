import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept requests going to our proxied API routes
  if (pathname.startsWith('/api/bridge') || pathname.startsWith('/api/paytech')) {
    const requestHeaders = new Headers(request.headers);
    
    // Inject secrets at the Edge
    if (pathname.startsWith('/api/bridge')) {
      requestHeaders.set('Api-Key', process.env.BRIDGE_API_KEY!);
    }
    
    if (pathname.startsWith('/api/paytech')) {
      requestHeaders.set('Authorization', `Bearer ${process.env.PAYTECH_SECRET_KEY}`);
    }

    // Rewrite the request with the new authenticated headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

// 2026 Matcher: Optimized to skip static files automatically
export const config = {
  matcher: '/api/:path*',
};
