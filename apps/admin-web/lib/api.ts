import { headers } from 'next/headers';

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';

export async function apiGet<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  try {
    const requestHeaders = await headers();
    const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
    const response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
      headers: {
        'x-qp-purpose': 'OPERATIONS',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    if (!response.ok) return { ok: false, reason: `Service returned ${response.status}` };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: 'The operations service is not connected' };
  }
}

export async function apiMutation<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  try {
    const requestHeaders = await headers();
    const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, reason: `Service returned ${response.status}` };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'The operations service is not connected' };
  }
}
