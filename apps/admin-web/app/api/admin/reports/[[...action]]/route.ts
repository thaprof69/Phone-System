import { headers } from 'next/headers';

/**
 * Server-side proxy for report mutations.
 *
 * An allowlist with an explicit upstream path per entry, not a pass-through: the
 * browser can reach exactly these operations and no others.
 */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const UUID = '[0-9a-fA-F-]{36}';

const ROUTES: Array<{ pattern: RegExp; upstream: (match: RegExpExecArray) => string }> = [
  {
    pattern: new RegExp(`^(${UUID})/schedule$`),
    upstream: (match) => `/reports/${match[1]}/schedule`,
  },
  { pattern: new RegExp(`^(${UUID})/run$`), upstream: (match) => `/reports/${match[1]}/run` },
  {
    pattern: new RegExp(`^runs/(${UUID})/retry$`),
    upstream: (match) => `/report-runs/${match[1]}/retry`,
  },
];

function resolve(path: string): string | null {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return route.upstream(match);
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  const upstreamPath = resolve((action ?? []).join('/'));
  if (!upstreamPath) {
    return Response.json({ message: 'Unknown report operation' }, { status: 404 });
  }

  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = await request.text();

  try {
    const upstream = await fetch(`${baseUrl}${upstreamPath}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-qp-purpose': 'ANALYTICS',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body ? { body } : {}),
    });
    const payload: unknown = await upstream.json().catch(() => ({}));
    return Response.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return Response.json(
      { message: 'The reporting service is not reachable. Nothing was saved.' },
      { status: 503 },
    );
  }
}
