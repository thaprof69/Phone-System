import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const allowedActions = new Set(['status', 'capabilities', 'test', 'connect', 'verify', 'rotate']);

async function proxy(
  request: Request,
  context: { params: Promise<{ action?: string[] }> },
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
) {
  const { action = [] } = await context.params;
  if (action.length > 1 || (action[0] && !allowedActions.has(action[0])))
    return NextResponse.json({ message: 'Unknown integration operation' }, { status: 404 });
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();
  try {
    const response = await fetch(
      `${apiBase}/admin/integrations/elevenlabs${action[0] ? `/${action[0]}` : ''}`,
      {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          'x-qp-purpose': 'RELEASE_MANAGEMENT',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body } : {}),
      },
    );
    const payload: unknown = await response.json().catch(() => ({
      message: 'The integration service returned an unreadable response',
    }));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      { message: 'The integration service is temporarily unavailable' },
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

export function PATCH(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return proxy(request, context, 'PATCH');
}

export function DELETE(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  return proxy(request, context, 'DELETE');
}
