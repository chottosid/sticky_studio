import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

const AUTH_ROUTE = '/login';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME);
  const { pathname } = request.nextUrl;
  const authenticated = await verifySessionToken(session?.value);

  const isProtectedRoute = pathname === '/' || pathname.startsWith('/opportunity');

  if (!authenticated && isProtectedRoute) {
    const absoluteURL = new URL(AUTH_ROUTE, request.url);
    return NextResponse.redirect(absoluteURL.toString());
  }

  if (authenticated && pathname === AUTH_ROUTE) {
    const absoluteURL = new URL('/', request.url);
    return NextResponse.redirect(absoluteURL.toString());
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
