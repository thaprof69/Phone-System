import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const ConfigurationSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    QP_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    TEMPORAL_ADDRESS: z.string().min(1),
    TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('eu-west-1'),
    S3_BUCKET_RAW: z.string().min(3),
    S3_BUCKET_ASSETS: z.string().min(3),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
    S3_KMS_KEY_ID: z.string().min(1).optional(),
    OIDC_ISSUER: z.url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET_REF: z.string().min(1),
    ELEVENLABS_BASE_URL: z.url(),
    ELEVENLABS_SECRET_REF: z.string().min(1),
    ELEVENLABS_WEBHOOK_SECRET_REF: z.string().min(1),
    ELEVENLABS_WORKSPACE_ID: z.string().min(1),
    ELEVENLABS_CAPABILITY_MODE: z.enum(['simulator', 'live']).default('simulator'),
    AUDIO_INGESTION_ENABLED: booleanString.default(false),
    CUSTOM_VOICE_ENABLED: booleanString.default(false),
    BOOKING_WRITES_ENABLED: booleanString.default(false),
    PRODUCTION_RETENTION_APPROVED: booleanString.default(false),
    PROVIDER_PRIVACY_APPROVED: booleanString.default(false),
    NATIVE_LANGUAGE_APPROVALS: z.string().default(''),
  })
  .superRefine((configuration, context) => {
    if (
      configuration.QP_ENVIRONMENT !== 'production' &&
      (!configuration.S3_ACCESS_KEY || !configuration.S3_SECRET_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY'],
        message: 'Local S3-compatible storage requires an access key and secret',
      });
    }
    if (configuration.QP_ENVIRONMENT !== 'production' && !configuration.S3_ENDPOINT) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'Local S3-compatible storage requires an endpoint',
      });
    }
    if (configuration.QP_ENVIRONMENT === 'production') {
      if (configuration.ELEVENLABS_CAPABILITY_MODE === 'simulator') {
        context.addIssue({
          code: 'custom',
          path: ['ELEVENLABS_CAPABILITY_MODE'],
          message: 'Simulator provider is forbidden in production',
        });
      }
      if (!configuration.PRODUCTION_RETENTION_APPROVED) {
        context.addIssue({
          code: 'custom',
          path: ['PRODUCTION_RETENTION_APPROVED'],
          message: 'Production retention must be approved',
        });
      }
      if (!configuration.PROVIDER_PRIVACY_APPROVED) {
        context.addIssue({
          code: 'custom',
          path: ['PROVIDER_PRIVACY_APPROVED'],
          message: 'Provider privacy must be approved',
        });
      }
      if (!configuration.S3_KMS_KEY_ID) {
        context.addIssue({
          code: 'custom',
          path: ['S3_KMS_KEY_ID'],
          message: 'Production raw evidence storage requires a KMS key',
        });
      }
    }
  });

export type Configuration = z.infer<typeof ConfigurationSchema>;

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): Configuration {
  return ConfigurationSchema.parse(environment);
}

export function runtimeSecret(
  name: string,
  developmentFallback: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment[name];
  if (configured) return configured;
  if (environment.QP_ENVIRONMENT === 'production') {
    throw new Error(`Required runtime secret ${name} is unavailable`);
  }
  return developmentFallback;
}

/**
 * Request rate limit per minute.
 *
 * The limit that matters is the caller-facing one, so it is the default: any
 * environment that is not explicitly a local development or automated-test
 * environment gets the strict production ceiling. Staging is deliberately included in
 * that — a staging environment that behaves more permissively than production is not
 * testing production.
 *
 * The relaxed ceiling exists because the browser suite issues far more than 120
 * requests a minute; throttled pages then correctly render their degraded state and
 * fail assertions for a reason unrelated to the code under test. It is raised, not
 * removed, so the limiter is still exercised.
 */
export const PRODUCTION_RATE_LIMIT_PER_MINUTE = 120;
export const RELAXED_RATE_LIMIT_PER_MINUTE = 5_000;

export function rateLimitPerMinute(environment: NodeJS.ProcessEnv = process.env): number {
  // Unset means unknown, and unknown is treated as production. Defaulting an absent
  // `QP_ENVIRONMENT` to development would mean a production deployment that forgot to
  // set it silently ran with a forty-fold weaker limit — the failure would be invisible
  // until it was exploited.
  const qpEnvironment = environment.QP_ENVIRONMENT ?? '';
  const nodeEnvironment = environment.NODE_ENV ?? '';
  const relaxed =
    (qpEnvironment === 'development' || nodeEnvironment === 'test') &&
    qpEnvironment !== 'production' &&
    qpEnvironment !== 'staging';
  return relaxed ? RELAXED_RATE_LIMIT_PER_MINUTE : PRODUCTION_RATE_LIMIT_PER_MINUTE;
}
