import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookie = request.cookies.get('allo_session')?.value;
  const session = cookie ? await verifySession(cookie) : null;

  // 1. Unauthenticated routes handling
  if (!session) {
    // Redirect login pages to continue
    if (pathname === '/login' || pathname === '/operations/login' || pathname === '/admin/login') {
      return NextResponse.next();
    }
    
    if (pathname === '/' || pathname.startsWith('/reservations')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (pathname.startsWith('/operations')) {
      return NextResponse.redirect(new URL('/operations/login', request.url));
    }
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    // Block protected APIs
    if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/operations')) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.next();
  }

  // 2. Authenticated user, trying to access login pages -> redirect to respective home pages
  if (pathname === '/login' || pathname === '/operations/login' || pathname === '/admin/login') {
    if (session.role === 'ADMIN') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (session.role === 'SERVICE_PROVIDER') {
      return NextResponse.redirect(new URL('/operations', request.url));
    }
    if (session.role === 'USER') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 3. Strict Portal Segregation
  // ADMIN role can access EVERYTHING (full administrative rights)
  if (session.role === 'ADMIN') {
    return NextResponse.next();
  }

  // SERVICE_PROVIDER role can access /operations and read-only storefront (/) but NOT admin or reservations checkout
  if (session.role === 'SERVICE_PROVIDER') {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/operations', request.url));
    }
    if (pathname.startsWith('/reservations')) {
      return NextResponse.redirect(new URL('/operations', request.url));
    }
    // API guards
    if (pathname.startsWith('/api/admin')) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.next();
  }

  // USER role can only access storefront (/) and checkouts (/reservations) but NOT admin or operations
  if (session.role === 'USER') {
    if (pathname.startsWith('/admin') || pathname.startsWith('/operations')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // API guards
    if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/operations')) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Forbidden: Access denied' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/reservations/:path*',
    '/operations/:path*',
    '/operations/login',
    '/admin/:path*',
    '/admin/login',
    '/api/admin/:path*',
    '/api/operations/:path*',
  ],
};
