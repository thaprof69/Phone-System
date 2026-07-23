import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if ((process.env.QP_ENVIRONMENT ?? 'development') !== 'production') return NextResponse.next();
  const identity = request.headers.get('x-amzn-oidc-identity');
  if (!identity)
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'cache-control': 'no-store' },
    });
  const response = NextResponse.next();
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
