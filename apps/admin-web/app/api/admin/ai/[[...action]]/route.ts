import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const safeSegment = /^[A-Za-z0-9_-]+$/;
const uuid = '[0-9a-f-]{36}';
// An explicit allowlist rather than a pass-through: the browser may reach exactly these
// operations and no others, so a new API route is not silently exposed by proxying.
const allowed = [
  /^overview$/,
  /^execution$/,
  /^monitoring$/,
  /^workspace$/,
  /^catalogue$/,
  /^readiness\/evaluate$/,
  /^providers\/registry$/,
  /^providers\/test$/,
  /^providers\/connect$/,
  new RegExp(`^providers/${uuid}/discover-models$`),
  new RegExp(`^providers/${uuid}$`),
  /^models$/,
  new RegExp(`^models/${uuid}/approval$`),
  new RegExp(`^models/${uuid}/availability$`),
  /^routes$/,
  new RegExp(`^routes/${uuid}/versions$`),
  new RegExp(`^route-versions/${uuid}/validate$`),
  new RegExp(`^route-versions/${uuid}/activate$`),
  new RegExp(`^route-versions/${uuid}/disable$`),
  /^artefacts\/(prompt|schema|taxonomy)$/,
  new RegExp(`^artefacts/(prompt|schema|taxonomy)/${uuid}/transition$`),
  /^budgets$/,
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
