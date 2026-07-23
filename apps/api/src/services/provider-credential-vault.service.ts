import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type EncryptedCredential = {
  secretReference: string;
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: string;
};

type ValidationProofPayload = {
  v: 1;
  provider: 'ELEVENLABS';
  keyHash: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  label: string;
  expiresAt: number;
};

@Injectable()
export class ProviderCredentialVaultService {
  private readonly key: Buffer;
  private readonly keyVersion = process.env.PROVIDER_CREDENTIAL_KEY_VERSION ?? 'v1';

  constructor() {
    const encoded =
      process.env.PROVIDER_CREDENTIAL_MASTER_KEY ??
      this.readKeyFile(process.env.PROVIDER_CREDENTIAL_MASTER_KEY_FILE);
    const decoded = encoded ? Buffer.from(encoded.trim(), 'base64') : Buffer.alloc(0);
    if (decoded.length !== 32) {
      throw new ServiceUnavailableException(
        'Provider credential vault is unavailable: a 32-byte base64 master key is required',
      );
    }
    this.key = decoded;
  }

  private readKeyFile(path: string | undefined): string | undefined {
    if (!path) return undefined;
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  }

  encrypt(provider: 'ELEVENLABS', plaintext: string): EncryptedCredential {
    const secretReference = `qp/provider/${provider.toLowerCase()}/${randomUUID()}`;
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, initializationVector);
    cipher.setAAD(Buffer.from(`${provider}:${secretReference}:${this.keyVersion}`));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      secretReference,
      ciphertext: ciphertext.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.keyVersion,
    };
  }

  decrypt(
    provider: 'ELEVENLABS',
    encrypted: Pick<
      EncryptedCredential,
      'secretReference' | 'ciphertext' | 'initializationVector' | 'authenticationTag' | 'keyVersion'
    >,
  ): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encrypted.initializationVector, 'base64'),
    );
    decipher.setAAD(
      Buffer.from(`${provider}:${encrypted.secretReference}:${encrypted.keyVersion}`),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  createValidationProof(input: {
    apiKey: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    label: string;
  }): string {
    const payload: ValidationProofPayload = {
      v: 1,
      provider: 'ELEVENLABS',
      keyHash: createHash('sha256').update(input.apiKey).digest('hex'),
      environment: input.environment,
      label: input.label,
      expiresAt: Date.now() + 5 * 60_000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.key).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  verifyValidationProof(
    proof: string,
    input: {
      apiKey: string;
      environment: 'SANDBOX' | 'PRODUCTION';
      label: string;
    },
  ): boolean {
    const [encoded, signature] = proof.split('.');
    if (!encoded || !signature) return false;
    const expected = createHmac('sha256', this.key).update(encoded).digest();
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
    try {
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as ValidationProofPayload;
      const keyHash = createHash('sha256').update(input.apiKey).digest('hex');
      return (
        payload.v === 1 &&
        payload.provider === 'ELEVENLABS' &&
        payload.environment === input.environment &&
        payload.label === input.label &&
        payload.keyHash === keyHash &&
        payload.expiresAt >= Date.now()
      );
    } catch {
      return false;
    }
  }
}
