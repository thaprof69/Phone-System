import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';

/**
 * Proxies the Intelligence Models and Model Routing pages onto the API. Only the
 * known operations are forwarded, so an unexpected path cannot be used to reach
 * something else behind the same prefix.
 */
const allowed: Array<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^models$/ },
  { method: 'POST', pattern: /^models$/ },
  { method: 'POST', pattern: /^submodels$/ },
  { method: 'PATCH', pattern: /^models\/[0-9a-f-]{36}$/i },
  { method: 'DELETE', pattern: /^models\/[0-9a-f-]{36}$/i },
  { method: 'POST', pattern: /^models\/[0-9a-f-]{36}\/test$/i },
  { method: 'GET', pattern: /^routes$/ },
  { method: 'PUT', pattern: /^routes\/[A-Z_]+$/ },
  { method: 'POST', pattern: /^routes\/[A-Z_]+\/test$/ },
  { method: 'GET', pattern: /^executions$/ },
  { method: 'POST', pattern: /^copilot\/enhance$/ },
  { method: 'POST', pattern: /^knowledge\/analyse$/ },
];

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
) {
  const { path = [] } = await context.params;
  const joined = path.join('/');
  if (!allowed.some((entry) => entry.method === method && entry.pattern.test(joined)))
    return NextResponse.json({ message: 'Unknown intelligence operation' }, { status: 404 });

  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();
  const search = new URL(request.url).search;

  try {
    const response = await fetch(`${apiBase}/admin/ai/intelligence/${joined}${search}`, {
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
    const payload: unknown = await response
      .json()
      .catch(() => ({ message: 'The intelligence service returned an unreadable response' }));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      { message: 'The intelligence service is temporarily unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'GET');
}
export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'POST');
}
export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'PATCH');
}
export async function PUT(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'PUT');
}
export async function DELETE(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, context, 'DELETE');
}
