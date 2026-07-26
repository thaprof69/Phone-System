import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Server-side proxy for live ElevenLabs voice sessions.
 *
 * An allowlist with an explicit upstream path per entry, not a pass-through: the
 * browser can reach exactly these operations and no others, and never sees the
 * internal API address or the caller's bearer token.
 */

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const UUID = '[0-9a-fA-F-]{36}';

const GET_ROUTES: Array<{ pattern: RegExp; upstream: (match: RegExpExecArray) => string }> = [
  { pattern: /^$/, upstream: () => '/voice-sessions' },
  { pattern: new RegExp(`^(${UUID})$`), upstream: (match) => `/voice-sessions/${match[1]}` },
];
const POST_ROUTES: Array<{ pattern: RegExp; upstream: (match: RegExpExecArray) => string }> = [
  { pattern: /^$/, upstream: () => '/voice-sessions' },
  {
    pattern: new RegExp(`^(${UUID})/attach$`),
    upstream: (match) => `/voice-sessions/${match[1]}/attach`,
  },
  {
    pattern: new RegExp(`^(${UUID})/end$`),
    upstream: (match) => `/voice-sessions/${match[1]}/end`,
  },
];

function resolve(
  routes: Array<{ pattern: RegExp; upstream: (match: RegExpExecArray) => string }>,
  path: string,
): string | null {
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (match) return route.upstream(match);
  }
  return null;
}

async function proxy(request: Request, upstreamPath: string, method: 'GET' | 'POST') {
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = method === 'POST' ? await request.text() : undefined;
  const search = method === 'GET' ? new URL(request.url).search : '';
  try {
    const upstream = await fetch(`${apiBase}${upstreamPath}${search}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body ? { body } : {}),
    });
    const payload: unknown = await upstream.json().catch(() => ({
      message: 'The voice session service returned an unreadable response',
    }));
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json(
      { message: 'The voice session service is temporarily unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}

export async function GET(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  const upstreamPath = resolve(GET_ROUTES, (action ?? []).join('/'));
  if (!upstreamPath)
    return NextResponse.json({ message: 'Unknown voice session operation' }, { status: 404 });
  return proxy(request, upstreamPath, 'GET');
}

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  const upstreamPath = resolve(POST_ROUTES, (action ?? []).join('/'));
  if (!upstreamPath)
    return NextResponse.json({ message: 'Unknown voice session operation' }, { status: 404 });
  return proxy(request, upstreamPath, 'POST');
}
