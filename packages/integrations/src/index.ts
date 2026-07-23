import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Result } from '@quantum-parks/domain';
import { failure, success } from '@quantum-parks/domain';

export interface EvidencePutResult {
  objectKey: string;
  checksum: string;
  size: number;
}
export interface EvidenceStore {
  putImmutable(
    key: string,
    body: Uint8Array,
    contentType: string,
    classification: 'CONFIDENTIAL' | 'RESTRICTED',
  ): Promise<Result<EvidencePutResult>>;
}

export class S3EvidenceStore implements EvidenceStore {
  private readonly client: S3Client;
  constructor(
    private readonly bucket: string,
    private readonly options: {
      endpoint?: string;
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      kmsKeyId?: string;
    },
  ) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    });
  }
  async putImmutable(
    key: string,
    body: Uint8Array,
    contentType: string,
    classification: 'CONFIDENTIAL' | 'RESTRICTED',
  ): Promise<Result<EvidencePutResult>> {
    const checksum = createHash('sha256').update(body).digest('hex');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
          Metadata: { classification, immutable: 'true', sha256: checksum },
          ...(this.options.kmsKeyId
            ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: this.options.kmsKeyId }
            : { ServerSideEncryption: 'AES256' }),
          IfNoneMatch: '*',
        }),
      );
      return success({ objectKey: key, checksum, size: body.byteLength });
    } catch {
      return failure(
        'UNAVAILABLE',
        'EVIDENCE_STORE_UNAVAILABLE',
        'Evidence storage is temporarily unavailable',
        true,
      );
    }
  }
}

export type CallerMatch =
  | { status: 'UNIQUE_MATCH'; customerId: string; preferredLanguage?: string; likelyPark?: string }
  | { status: 'NO_MATCH' | 'AMBIGUOUS_MATCH' | 'UNAUTHORIZED' | 'UNAVAILABLE' };

export interface CustomerPort {
  matchCaller(e164: string): Promise<CallerMatch>;
  verify(
    customerId: string,
    factors: Record<string, string>,
  ): Promise<Result<{ verificationId: string; level: 'STRONG' }>>;
  getMinimumContext(customerId: string): Promise<Result<Record<string, unknown>>>;
}
export interface BookingPort {
  getUpcoming(customerId: string): Promise<Result<Array<Record<string, unknown>>>>;
  checkAvailability(
    park: string,
    activity: string,
    date: string,
  ): Promise<Result<{ available: boolean; noHold: true }>>;
}
export interface SupportPort {
  getRecent(customerId: string): Promise<Result<Array<Record<string, unknown>>>>;
}
export interface MessagingPort {
  send(input: {
    channel: 'WHATSAPP' | 'SMS';
    recipient: string;
    templateKey: string;
    variables: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Result<{ providerMessageId: string; status: 'QUEUED' }>>;
}

export class DeterministicCustomerAdapter implements CustomerPort {
  async matchCaller(e164: string): Promise<CallerMatch> {
    if (e164 === '+351910000001')
      return {
        status: 'UNIQUE_MATCH',
        customerId: 'customer_synthetic_1',
        preferredLanguage: 'pt-PT',
        likelyPark: 'Lisboa',
      };
    if (e164 === '+351910000099') return { status: 'AMBIGUOUS_MATCH' };
    return { status: 'NO_MATCH' };
  }
  async verify(customerId: string, factors: Record<string, string>) {
    return factors.otp === '123456' && factors.booking_reference === 'QP-SYNTH-1'
      ? success({ verificationId: `verify_${customerId}`, level: 'STRONG' as const })
      : failure<{ verificationId: string; level: 'STRONG' }>(
          'UNAUTHORIZED',
          'VERIFICATION_FAILED',
          'Verification could not be completed',
        );
  }
  async getMinimumContext(customerId: string) {
    return success({ customerId, status: 'ACTIVE' });
  }
}

export class DeterministicBookingAdapter implements BookingPort {
  async getUpcoming(customerId: string) {
    return success([
      { bookingId: 'booking_synthetic_1', customerId, park: 'Lisboa', date: '2026-08-01' },
    ]);
  }
  async checkAvailability(park: string, activity: string, date: string) {
    return success({ available: Boolean(park && activity && date), noHold: true as const });
  }
}

export class DeterministicSupportAdapter implements SupportPort {
  async getRecent(customerId: string) {
    return success([
      { ticketId: 'ticket_synthetic_1', customerId, status: 'OPEN', subject: 'Synthetic fixture' },
    ]);
  }
}

export class DeterministicMessagingAdapter implements MessagingPort {
  async send(input: {
    channel: 'WHATSAPP' | 'SMS';
    recipient: string;
    templateKey: string;
    variables: Record<string, string>;
    idempotencyKey: string;
  }) {
    return success({
      providerMessageId: `message_${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 12)}`,
      status: 'QUEUED' as const,
    });
  }
}
