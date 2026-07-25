import { headers } from 'next/headers';

/** Server-side proxy for operations queue transitions. */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const KINDS = new Set(['callbacks', 'tasks', 'handoffs', 'messages']);
const UUID = /^[0-9a-fA-F-]{36}$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await context.params;
  if (!KINDS.has(kind) || !UUID.test(id)) {
    return Response.json({ message: 'Unknown operation' }, { status: 404 });
  }

  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  const body = await request.text();

  try {
    const upstream = await fetch(`${baseUrl}/operations/${kind}/${id}/transition`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'content-type': 'application/json',
        'x-qp-purpose': 'OPERATIONS',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body || '{}',
    });
    const payload: unknown = await upstream.json().catch(() => ({}));
    return Response.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return Response.json(
      { message: 'The operations service is not reachable. Nothing changed.' },
      { status: 503 },
    );
  }
}
