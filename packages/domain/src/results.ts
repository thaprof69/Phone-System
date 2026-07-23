import { z } from 'zod';

export const FailureStatusSchema = z.enum([
  'NOT_FOUND',
  'NO_MATCH',
  'AMBIGUOUS',
  'VERIFICATION_REQUIRED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_SUPPORTED',
  'NOT_CONFIGURED',
  'CONFLICT',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNAVAILABLE',
  'PARTIAL',
  'PROVIDER_ERROR',
  'UNKNOWN_FAILURE',
]);
export type FailureStatus = z.infer<typeof FailureStatusSchema>;

export type Result<T> =
  | { status: 'SUCCESS'; data: T; requestId?: string }
  | {
      status: FailureStatus;
      error: { code: string; safeMessage: string; retryable: boolean };
      requestId?: string;
    };

export function success<T>(data: T, requestId?: string): Result<T> {
  return requestId === undefined
    ? { status: 'SUCCESS', data }
    : { status: 'SUCCESS', data, requestId };
}

export function failure<T>(
  status: FailureStatus,
  code: string,
  safeMessage: string,
  retryable = false,
): Result<T> {
  return { status, error: { code, safeMessage, retryable } };
}
