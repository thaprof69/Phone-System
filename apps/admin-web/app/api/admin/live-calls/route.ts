import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';

export async function GET() {
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  try {
    const upstream = await fetch(`${apiBase}/live-calls`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'x-qp-purpose': 'OPERATIONS',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    const payload: unknown = await upstream.json().catch(() => ({
      status: 'DEGRADED',
      activeCalls: [],
      message: 'The live call monitor returned an unreadable response',
    }));
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      {
        status: 'DEGRADED',
        activeCalls: [],
        message: 'The live call monitor is temporarily unavailable',
      },
      { status: 503, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}
