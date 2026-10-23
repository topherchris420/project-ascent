import { NextResponse, type NextRequest } from 'next/server';
import { isHomeRoute } from '@/lib/home-routes';

/**
 * Answers an unknown Homeowner OS address with a real 404. The root loading boundary streams every page, so a
 * page that calls notFound() has already committed a 200; this runs first, and only for /home/{market}/{parcel}.
 */
export function proxy(request: NextRequest) {
  const [, , market = '', raw = ''] = request.nextUrl.pathname.split('/');
  let parcel = '';
  try {
    parcel = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a parcel.
  }
  if (isHomeRoute(market, parcel)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

export const config = { matcher: '/home/:market/:parcel' };
