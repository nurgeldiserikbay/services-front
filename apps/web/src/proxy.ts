import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

export function proxy(request: NextRequest) {
  const locale = request.nextUrl.pathname.split('/')[1];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-services-locale', locale);
  return NextResponse.next({request: {headers: requestHeaders}});
}

export const config = {
  matcher: ['/kk/:path*', '/ru/:path*'],
};
