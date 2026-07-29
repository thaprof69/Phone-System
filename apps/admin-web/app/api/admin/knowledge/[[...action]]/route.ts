import { headers } from 'next/headers';

/**
 * Server-side proxy for knowledge mutations.
 *
 * An allowlist with an explicit upstream path per entry, not a pass-through: the
 * browser can reach exactly these operations and no others.
 */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const UUID = '[0-9a-fA-F-]{36}';

const ROUTES: Array<{ pattern: RegExp; upstream: (id: string) => string }> = [
  {
    pattern: /^(create)$/,
    upstream: () => '/knowledge',
  },
  {
    pattern: new RegExp(`^(${UUID})/versions$`),
    upstream: (id) => `/knowledge/${id}/versions`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/submit$`),
    upstream: (id) => `/knowledge-versions/${id}/submit`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/save$`),
    upstream: (id) => `/knowledge-versions/${id}/save`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/decision$`),
    upstream: (id) => `/knowledge-versions/${id}/decision`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/assignments$`),
    upstream: (id) => `/knowledge-versions/${id}/assignments`,
  },
  {
    pattern: new RegExp(`^syncs/(${UUID})/retry$`),
    upstream: (id) => `/knowledge-syncs/${id}/retry`,
  },
  {
    pattern: new RegExp(`^gaps/(${UUID})/convert$`),
    upstream: (id) => `/knowledge-gaps/${id}/convert`,
  },
];

export function resolve(path: string): string | null {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match?.[1]) return route.upstream(match[1]);
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  const upstreamPath = resolve((action ?? []).join('/'));
  if (!upstreamPath) {
    return Response.json({ message: 'Unknown knowledge operation' }, { status: 404 });
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
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
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
      { message: 'The operations service is not reachable. Nothing was saved.' },
      { status: 503 },
    );
  }
}
