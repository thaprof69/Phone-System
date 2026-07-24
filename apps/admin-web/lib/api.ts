import { headers } from 'next/headers';

const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';

/**
 * The declared reason a request is being made. The API records it on every audited
 * route, so a read for operations is distinguishable from a read for a privacy audit.
 */
export type Purpose =
  | 'OPERATIONS'
  | 'QUALITY_REVIEW'
  | 'CUSTOMER_SUPPORT'
  | 'ANALYTICS'
  | 'PRIVACY_AUDIT'
  | 'RELEASE_MANAGEMENT';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string; status?: number };

async function authorization(): Promise<Record<string, string>> {
  const requestHeaders = await headers();
  const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

/**
 * Reads never throw. Every list and detail view renders a degraded state instead of
 * an error boundary, so one unavailable panel does not blank an entire workspace.
 */
export async function apiGet<T>(
  path: string,
  options: { purpose?: Purpose; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { purpose = 'OPERATIONS', timeoutMs = 6_000 } = options;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'x-qp-purpose': purpose, ...(await authorization()) },
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason:
          response.status === 403
            ? 'You do not have permission to view this'
            : response.status === 404
              ? 'This record no longer exists'
              : `The service returned ${response.status}`,
      };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: 'The operations service is not reachable' };
  }
}

export async function apiMutation<T>(
  path: string,
  body: unknown,
  options: { purpose?: Purpose; method?: 'POST' | 'PATCH' | 'DELETE'; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { purpose = 'RELEASE_MANAGEMENT', method = 'POST', timeoutMs = 12_000 } = options;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-qp-purpose': purpose,
        ...(await authorization()),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message: unknown }).message)
          : `The service returned ${response.status}`;
      return { ok: false, status: response.status, reason: message };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, reason: 'The operations service is not reachable' };
  }
}
