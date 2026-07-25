import { headers } from 'next/headers';

/**
 * Server-side proxy for agent mutations.
 *
 * The browser never holds the internal API address or the caller's bearer token, and it
 * can only reach the operations named below. This is an allowlist with an explicit
 * upstream path for each entry rather than a pass-through: a proxy that forwarded any
 * path would hand the browser the whole API.
 */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const UUID = '[0-9a-fA-F-]{36}';

const ROUTES: Array<{ pattern: RegExp; upstream: (id: string) => string }> = [
  {
    pattern: new RegExp(`^versions/(${UUID})/configuration$`),
    upstream: (id) => `/agent-versions/${id}/configuration`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/submit$`),
    upstream: (id) => `/agent-versions/${id}/submit`,
  },
  {
    pattern: new RegExp(`^(${UUID})/draft$`),
    upstream: (id) => `/agents/${id}/draft`,
  },
  {
    pattern: new RegExp(`^versions/(${UUID})/verify-read-back$`),
    upstream: (id) => `/agent-versions/${id}/verify-read-back`,
  },
  {
    pattern: new RegExp(`^(${UUID})/rollback$`),
    upstream: (id) => `/agents/${id}/rollback`,
  },
  {
    pattern: new RegExp(`^drift/(${UUID})/resolve$`),
    upstream: (id) => `/agent-drift/${id}/resolve`,
  },
  {
    pattern: new RegExp(`^releases/(${UUID})/decision$`),
    upstream: (id) => `/agent-releases/${id}/decision`,
  },
  {
    pattern: new RegExp(`^releases/(${UUID})/stage-for-test$`),
    upstream: (id) => `/agent-releases/${id}/stage-for-test`,
  },
  {
    pattern: new RegExp(`^releases/(${UUID})/promote$`),
    upstream: (id) => `/agent-releases/${id}/promote`,
  },
  {
    pattern: new RegExp(`^releases/(${UUID})/publish$`),
    upstream: (id) => `/agent-releases/${id}/publish`,
  },
];

function resolve(path: string): string | null {
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
    return Response.json({ message: 'Unknown agent operation' }, { status: 404 });
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
        'content-type': 'application/json',
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
    // Reported as a failure, never as a save that quietly did nothing.
    return Response.json(
      { message: 'The operations service is not reachable. Nothing was saved.' },
      { status: 503 },
    );
  }
}
