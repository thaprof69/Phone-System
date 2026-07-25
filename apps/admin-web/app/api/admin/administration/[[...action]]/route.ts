import { headers } from 'next/headers';

/**
 * Server-side proxy for administration mutations: feature flags, retention
 * policies, legal holds and role assignment.
 *
 * An allowlist with an explicit upstream path per entry, not a pass-through: the
 * browser can reach exactly these operations and no others.
 */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const UUID = '[0-9a-fA-F-]{36}';

const ROUTES: Array<{
  pattern: RegExp;
  upstream: (match: RegExpExecArray) => string;
  purpose: 'RELEASE_MANAGEMENT' | 'PRIVACY_AUDIT';
}> = [
  {
    pattern: new RegExp(`^feature-flags/(${UUID})$`),
    upstream: (match) => `/administration/feature-flags/${match[1]}`,
    purpose: 'RELEASE_MANAGEMENT',
  },
  {
    pattern: new RegExp(`^retention/(${UUID})/approve$`),
    upstream: (match) => `/retention-policies/${match[1]}/approve`,
    purpose: 'PRIVACY_AUDIT',
  },
  {
    pattern: new RegExp(`^retention/(${UUID})/active$`),
    upstream: (match) => `/retention-policies/${match[1]}/active`,
    purpose: 'PRIVACY_AUDIT',
  },
  {
    pattern: /^legal-holds$/,
    upstream: () => '/legal-holds',
    purpose: 'PRIVACY_AUDIT',
  },
  {
    pattern: new RegExp(`^legal-holds/(${UUID})/release$`),
    upstream: (match) => `/legal-holds/${match[1]}/release`,
    purpose: 'PRIVACY_AUDIT',
  },
  {
    pattern: /^roles\/assign$/,
    upstream: () => '/administration/roles/assign',
    purpose: 'RELEASE_MANAGEMENT',
  },
  {
    pattern: /^roles\/revoke$/,
    upstream: () => '/administration/roles/revoke',
    purpose: 'RELEASE_MANAGEMENT',
  },
];

function resolve(path: string): { upstreamPath: string; purpose: string } | null {
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return { upstreamPath: route.upstream(match), purpose: route.purpose };
  }
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  const resolved = resolve((action ?? []).join('/'));
  if (!resolved) {
    return Response.json({ message: 'Unknown administration operation' }, { status: 404 });
  }

  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = await request.text();

  try {
    const upstream = await fetch(`${baseUrl}${resolved.upstreamPath}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-qp-purpose': resolved.purpose,
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
      { message: 'The administration service is not reachable. Nothing was saved.' },
      { status: 503 },
    );
  }
}
