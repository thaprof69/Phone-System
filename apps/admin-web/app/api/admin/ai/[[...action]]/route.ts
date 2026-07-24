import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const safeSegment = /^[A-Za-z0-9_-]+$/;
const allowed = [
  /^overview$/,
  /^workspace$/,
  /^catalogue$/,
  /^readiness\/evaluate$/,
  /^providers\/test$/,
  /^providers\/connect$/,
  /^providers\/[0-9a-f-]{36}\/discover-models$/,
  /^providers\/[0-9a-f-]{36}$/,
];

async function proxy(
  request: Request,
  context: { params: Promise<{ action?: string[] }> },
  method: 'GET' | 'POST' | 'DELETE',
) {
  const { action = [] } = await context.params;
  if (action.some((segment) => !safeSegment.test(segment))) {
    return NextResponse.json({ message: 'Unknown AIOS operation' }, { status: 404 });
  }
  const path = action.join('/');
  if (!allowed.some((pattern) => pattern.test(path)))
    return NextResponse.json({ message: 'Unknown AIOS operation' }, { status: 404 });
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();
  try {
    const response = await fetch(`${apiBase}/admin/ai/${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body ? { body } : {}),
    });
    const payload: unknown = await response.json().catch(() => ({
      message: 'The AIOS service returned an unreadable response',
    }));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      { message: 'The AIOS platform service is temporarily unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}

export function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return proxy(request, context, 'GET');
}
export function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return proxy(request, context, 'POST');
}
export function DELETE(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return proxy(request, context, 'DELETE');
}
