/**
 * The production contract every intelligence provider adapter implements.
 *
 * Adapters own one thing: speaking a specific provider's real HTTP API and
 * translating its successes and failures into these provider-agnostic shapes.
 * They hold no state, never log credentials, and never decide routing — the
 * routing engine does that using `NormalisedError.fallbackEligible`.
 */

export type IntelligenceProviderKey =
  'OPENAI' | 'ANTHROPIC' | 'DEEPSEEK' | 'KIMI' | 'QWEN' | 'GEMINI';

export const INTELLIGENCE_PROVIDERS: readonly IntelligenceProviderKey[] = [
  'OPENAI',
  'ANTHROPIC',
  'DEEPSEEK',
  'KIMI',
  'QWEN',
  'GEMINI',
] as const;

export const PROVIDER_LABELS: Record<IntelligenceProviderKey, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  DEEPSEEK: 'DeepSeek',
  KIMI: 'Kimi',
  QWEN: 'Qwen',
  GEMINI: 'Gemini',
};

/** Provider-agnostic failure categories. Mirrors the `intelligence_error_category` enum. */
export type ErrorCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export type NormalisedError = {
  category: ErrorCategory;
  /** Operator-facing message. Never contains the credential. */
  message: string;
  retryable: boolean;
  /**
   * Whether the routing engine may try the fallback model. False for faults that
   * a different provider would hit identically — malformed requests, policy
   * rejections — so a fallback is never burned on a request that cannot succeed.
   */
  fallbackEligible: boolean;
  status?: number;
  providerRequestId?: string;
};

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type DiscoveredModel = {
  id: string;
  displayName?: string;
};

export type ExecuteInput = {
  submodel: string;
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type ExecuteResult = {
  text: string;
  providerRequestId?: string;
  usage?: TokenUsage;
};

export type AdapterOk<T> = { ok: true } & T;
export type AdapterErr = { ok: false; error: NormalisedError };
export type AdapterResult<T> = AdapterOk<T> | AdapterErr;

export interface IntelligenceProviderAdapter {
  readonly provider: IntelligenceProviderKey;

  /** Does the provider accept this credential at all? */
  validateCredential(
    apiKey: string,
    timeoutMs?: number,
  ): Promise<AdapterResult<Record<never, never>>>;

  /**
   * The provider's real model list where one is exposed. Adapters that cannot
   * enumerate models return `discoverable: false` and the caller falls back to
   * the server-side registry.
   */
  discoverModels(
    apiKey: string,
    timeoutMs?: number,
  ): Promise<AdapterResult<{ models: DiscoveredModel[]; discoverable: boolean }>>;

  /** Is this specific submodel present and usable for this credential? */
  validateModel(
    apiKey: string,
    submodel: string,
    timeoutMs?: number,
  ): Promise<AdapterResult<Record<never, never>>>;

  /** A real completion request. */
  execute(apiKey: string, input: ExecuteInput): Promise<AdapterResult<{ result: ExecuteResult }>>;

  /**
   * The full live check behind a green status light: credential accepted, submodel
   * reachable, a minimal request completed, and the response parseable.
   */
  healthCheck(
    apiKey: string,
    submodel: string,
    timeoutMs?: number,
  ): Promise<AdapterResult<{ result: ExecuteResult }>>;

  normaliseError(error: unknown, status?: number, body?: unknown): NormalisedError;

  reportUsage(raw: unknown): TokenUsage | undefined;
}

export function isAdapterErr<T>(result: AdapterResult<T>): result is AdapterErr {
  return result.ok === false;
}

/** Categories that justify trying a different provider. */
export function categoryIsFallbackEligible(category: ErrorCategory): boolean {
  switch (category) {
    case 'AUTHENTICATION':
    case 'AUTHORIZATION':
    case 'MODEL_NOT_FOUND':
    case 'RATE_LIMIT':
    case 'TIMEOUT':
    case 'NETWORK':
    case 'PROVIDER_ERROR':
    case 'INVALID_RESPONSE':
      return true;
    // The application sent something wrong. Another provider fails the same way.
    case 'INVALID_REQUEST':
      return false;
    case 'UNKNOWN':
      return true;
    default:
      return false;
  }
}

export function categoryForStatus(status: number): ErrorCategory {
  if (status === 401) return 'AUTHENTICATION';
  if (status === 403) return 'AUTHORIZATION';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 400 || status === 422) return 'INVALID_REQUEST';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'PROVIDER_ERROR';
  return 'UNKNOWN';
}

export function buildError(
  category: ErrorCategory,
  message: string,
  extra: { status?: number; providerRequestId?: string; retryable?: boolean } = {},
): NormalisedError {
  return {
    category,
    message,
    retryable:
      extra.retryable ??
      (category === 'RATE_LIMIT' ||
        category === 'TIMEOUT' ||
        category === 'NETWORK' ||
        category === 'PROVIDER_ERROR'),
    fallbackEligible: categoryIsFallbackEligible(category),
    ...(extra.status === undefined ? {} : { status: extra.status }),
    ...(extra.providerRequestId === undefined
      ? {}
      : { providerRequestId: extra.providerRequestId }),
  };
}

/** A fetch wrapper with a hard timeout, normalising transport faults. */
export async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<
  | { ok: true; status: number; body: unknown; requestId?: string }
  | { ok: false; error: NormalisedError }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const requestId =
      response.headers.get('x-request-id') ??
      response.headers.get('request-id') ??
      response.headers.get('x-amzn-requestid') ??
      undefined;
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        // Non-JSON body: surfaced as INVALID_RESPONSE by the caller when unexpected.
        body = { raw: text.slice(0, 500) };
      }
    }
    return { ok: true, status: response.status, body, ...(requestId ? { requestId } : {}) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      return {
        ok: false,
        error: buildError('TIMEOUT', `The provider did not respond within ${timeoutMs}ms.`),
      };
    return {
      ok: false,
      error: buildError('NETWORK', 'The provider could not be reached.'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Remove credential material from provider text before it is shown or stored.
 *
 * Providers commonly echo the offending key back — OpenAI, for example, replies
 * "Incorrect API key provided: sk-abcd****wxyz". Even partially masked, that is key
 * material, and it must not reach the browser, the database or a log line.
 */
export function redactSecrets(text: string): string {
  return (
    text
      // Recognisable key prefixes followed by key-ish characters (including mask runs).
      .replace(/\b(sk|pk|api|key|token)[-_][A-Za-z0-9*_-]{6,}/gi, '[redacted]')
      // Google-style keys.
      .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[redacted]')
      // Any remaining long opaque run containing mask characters.
      .replace(/\b[A-Za-z0-9]{4,}\*{4,}[A-Za-z0-9]{2,}\b/g, '[redacted]')
  );
}

/** Pull a human-readable message out of a provider error body without leaking internals. */
export function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const error = record['error'];
    if (typeof error === 'string') return redactSecrets(error);
    if (typeof error === 'object' && error !== null) {
      const message = (error as Record<string, unknown>)['message'];
      if (typeof message === 'string' && message.trim()) return redactSecrets(message);
    }
    const message = record['message'];
    if (typeof message === 'string' && message.trim()) return redactSecrets(message);
  }
  return fallback;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
