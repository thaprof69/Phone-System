import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const allowed = new Set(['draft-alert']);

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action = [] } = await context.params;
  const path = action.join('/');
  if (!allowed.has(path))
    return NextResponse.json({ message: 'Unknown communications operation' }, { status: 404 });
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  try {
    const response = await fetch(`${apiBase}/admin/communications/${path}`, {
      method: 'POST',
      body: await request.text(),
      signal: AbortSignal.timeout(30_000),
      headers: {
        'content-type': 'application/json',
        'x-qp-purpose': 'OPERATIONS',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      { message: 'The communications service is temporarily unavailable' },
      { status: 503 },
    );
  }
}
