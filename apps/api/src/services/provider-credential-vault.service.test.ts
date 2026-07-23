import { afterEach, describe, expect, it } from 'vitest';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';

const masterKey = Buffer.alloc(32, 7).toString('base64');
const previousMasterKey = process.env.PROVIDER_CREDENTIAL_MASTER_KEY;

afterEach(() => {
  if (previousMasterKey === undefined) delete process.env.PROVIDER_CREDENTIAL_MASTER_KEY;
  else process.env.PROVIDER_CREDENTIAL_MASTER_KEY = previousMasterKey;
});

describe('ProviderCredentialVaultService', () => {
  it('encrypts credentials with authenticated encryption and never stores plaintext', () => {
    process.env.PROVIDER_CREDENTIAL_MASTER_KEY = masterKey;
    const vault = new ProviderCredentialVaultService();
    const encrypted = vault.encrypt('ELEVENLABS', 'elevenlabs-secret-value');

    expect(encrypted.ciphertext).not.toContain('elevenlabs-secret-value');
    expect(encrypted.secretReference).not.toContain('elevenlabs-secret-value');
    expect(vault.decrypt('ELEVENLABS', encrypted)).toBe('elevenlabs-secret-value');
  });

  it('binds validation proof to the exact key, label, and environment', () => {
    process.env.PROVIDER_CREDENTIAL_MASTER_KEY = masterKey;
    const vault = new ProviderCredentialVaultService();
    const input = {
      apiKey: 'elevenlabs-secret-value',
      environment: 'SANDBOX' as const,
      label: 'Operations',
    };
    const proof = vault.createValidationProof(input);

    expect(proof).not.toContain(input.apiKey);
    expect(vault.verifyValidationProof(proof, input)).toBe(true);
    expect(vault.verifyValidationProof(proof, { ...input, apiKey: 'different-secret' })).toBe(
      false,
    );
    expect(vault.verifyValidationProof(proof, { ...input, environment: 'PRODUCTION' })).toBe(false);
  });
});
