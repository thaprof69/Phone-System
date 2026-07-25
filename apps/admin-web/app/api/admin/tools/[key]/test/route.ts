import { headers } from 'next/headers';

/** Server-side proxy for the tool contract test. Tool keys are code-owned identifiers. */

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const TOOL_KEY = /^[a-z0-9_]+$/;

export async function POST(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!TOOL_KEY.test(key)) {
    return Response.json({ message: 'Unknown tool' }, { status: 404 });
  }

  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');

  try {
    const upstream = await fetch(`${baseUrl}/tool-contracts/${key}/test`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      // No content-type: this request carries no body, and Fastify rejects an empty
      // body when the header declares JSON.
      headers: {
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    const payload: unknown = await upstream.json().catch(() => ({}));
    return Response.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch {
    return Response.json(
      { message: 'The operations service is not reachable, so no test was run.' },
      { status: 503 },
    );
  }
}
