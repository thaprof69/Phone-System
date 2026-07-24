import { describe, expect, it } from 'vitest';
import { ConfigurationSchema, runtimeSecret } from './index.js';

const validEnvironment = {
  NODE_ENV: 'development',
  QP_ENVIRONMENT: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/quantum',
  REDIS_URL: 'redis://localhost:6379',
  TEMPORAL_ADDRESS: 'localhost:7233',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET_RAW: 'raw-evidence',
  S3_BUCKET_ASSETS: 'assets-store',
  S3_ACCESS_KEY: 'local',
  S3_SECRET_KEY: 'local-secret',
  OIDC_ISSUER: 'http://localhost:8080/realms/quantum',
  OIDC_CLIENT_ID: 'admin',
  OIDC_CLIENT_SECRET_REF: 'local/oidc',
  ELEVENLABS_BASE_URL: 'http://localhost:4100',
  ELEVENLABS_SECRET_REF: 'local/elevenlabs',
  ELEVENLABS_WEBHOOK_SECRET_REF: 'local/elevenlabs-webhook',
  ELEVENLABS_WORKSPACE_ID: 'workspace_synthetic',
};

describe('runtime configuration gates', () => {
  it('rejects simulator mode in production', () => {
    const result = ConfigurationSchema.safeParse({
      ...validEnvironment,
      QP_ENVIRONMENT: 'production',
      ELEVENLABS_CAPABILITY_MODE: 'simulator',
      PRODUCTION_RETENTION_APPROVED: 'true',
      PROVIDER_PRIVACY_APPROVED: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('does not accept environment-selected AI routes as configuration', () => {
    const result = ConfigurationSchema.safeParse({
      ...validEnvironment,
      ENRICHMENT_PROVIDER: 'openai-responses',
      OPENAI_MODEL: 'environment-model',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('ENRICHMENT_PROVIDER' in result.data).toBe(false);
      expect('OPENAI_MODEL' in result.data).toBe(false);
    }
  });

  it('never falls back to synthetic secrets in production', () => {
    expect(() =>
      runtimeSecret('MISSING_SECRET', 'synthetic', { QP_ENVIRONMENT: 'production' }),
    ).toThrow('Required runtime secret MISSING_SECRET is unavailable');
  });
});
