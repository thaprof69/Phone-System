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

export type CommunicationsDeliveryResult =
  | {
      status: 'ACCEPTED';
      providerMessageId: string;
      provider: 'GMAIL' | 'WHATSAPP_CLOUD';
    }
  | {
      status: 'NOT_CONFIGURED' | 'REJECTED' | 'TEMPORARILY_UNAVAILABLE';
      code: string;
      detail: string;
    };

export interface EmailAlertInput {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

/**
 * Gmail's REST boundary. OAuth tokens are supplied by server-side credential
 * management and never accepted from, or returned to, browser code.
 */
export class GmailAlertAdapter {
  constructor(
    private readonly configuration: {
      accessToken?: string;
      sender?: string;
      userId?: string;
    },
  ) {}

  readiness() {
    return {
      provider: 'GMAIL' as const,
      status:
        this.configuration.accessToken && this.configuration.sender
          ? ('CONFIGURED' as const)
          : ('NOT_CONFIGURED' as const),
      sender: this.configuration.sender ?? null,
      auth: 'OAUTH_2' as const,
      requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
      supports: ['SEND_ALERT', 'CREATE_DRAFT'] as const,
    };
  }

  async send(input: EmailAlertInput): Promise<CommunicationsDeliveryResult> {
    if (!this.configuration.accessToken || !this.configuration.sender)
      return {
        status: 'NOT_CONFIGURED',
        code: 'GMAIL_CREDENTIALS_REQUIRED',
        detail: 'Gmail OAuth credentials and an approved sender mailbox are required.',
      };

    const mime = [
      `From: ${this.configuration.sender}`,
      `To: ${input.to}`,
      `Subject: ${input.subject.replaceAll(/[\r\n]/g, ' ')}`,
      'Content-Type: text/plain; charset=UTF-8',
      `X-Quantum-Parks-Idempotency-Key: ${input.idempotencyKey}`,
      '',
      input.text,
    ].join('\r\n');

    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.configuration.userId ?? 'me')}/messages/send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.configuration.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { id?: string };
      if (!response.ok || !payload.id)
        return {
          status: response.status >= 500 ? 'TEMPORARILY_UNAVAILABLE' : 'REJECTED',
          code: `GMAIL_HTTP_${response.status}`,
          detail: 'Gmail did not accept the alert message.',
        };
      return { status: 'ACCEPTED', providerMessageId: payload.id, provider: 'GMAIL' };
    } catch {
      return {
        status: 'TEMPORARILY_UNAVAILABLE',
        code: 'GMAIL_UNAVAILABLE',
        detail: 'Gmail could not be reached.',
      };
    }
  }
}

export interface WhatsAppAlertInput {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  idempotencyKey: string;
}

/** Meta WhatsApp Cloud API boundary for approved operational templates. */
export class WhatsAppCloudAlertAdapter {
  constructor(
    private readonly configuration: {
      accessToken?: string;
      phoneNumberId?: string;
      businessAccountId?: string;
      graphVersion?: string;
    },
  ) {}

  readiness() {
    return {
      provider: 'WHATSAPP_CLOUD' as const,
      status:
        this.configuration.accessToken &&
        this.configuration.phoneNumberId &&
        this.configuration.businessAccountId
          ? ('CONFIGURED' as const)
          : ('NOT_CONFIGURED' as const),
      phoneNumberId: this.configuration.phoneNumberId ?? null,
      businessAccountId: this.configuration.businessAccountId ?? null,
      auth: 'SYSTEM_USER_ACCESS_TOKEN' as const,
      supports: ['SEND_APPROVED_TEMPLATE', 'DELIVERY_WEBHOOK', 'INBOUND_WEBHOOK'] as const,
    };
  }

  async sendTemplate(input: WhatsAppAlertInput): Promise<CommunicationsDeliveryResult> {
    if (
      !this.configuration.accessToken ||
      !this.configuration.phoneNumberId ||
      !this.configuration.businessAccountId
    )
      return {
        status: 'NOT_CONFIGURED',
        code: 'WHATSAPP_CREDENTIALS_REQUIRED',
        detail: 'A Meta access token, business account and phone number are required.',
      };
    if (!input.templateName)
      return {
        status: 'REJECTED',
        code: 'WHATSAPP_TEMPLATE_REQUIRED',
        detail: 'Business-initiated alerts require an approved WhatsApp template.',
      };

    try {
      const version = this.configuration.graphVersion ?? 'v23.0';
      const response = await fetch(
        `https://graph.facebook.com/${version}/${encodeURIComponent(this.configuration.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.configuration.accessToken}`,
            'content-type': 'application/json',
            'x-idempotency-key': input.idempotencyKey,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'template',
            template: {
              name: input.templateName,
              language: { code: input.languageCode },
              components: input.parameters.length
                ? [
                    {
                      type: 'body',
                      parameters: input.parameters.map((text) => ({ type: 'text', text })),
                    },
                  ]
                : [],
            },
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
      };
      const id = payload.messages?.[0]?.id;
      if (!response.ok || !id)
        return {
          status: response.status >= 500 ? 'TEMPORARILY_UNAVAILABLE' : 'REJECTED',
          code: `WHATSAPP_HTTP_${response.status}`,
          detail: 'WhatsApp Cloud API did not accept the alert template.',
        };
      return { status: 'ACCEPTED', providerMessageId: id, provider: 'WHATSAPP_CLOUD' };
    } catch {
      return {
        status: 'TEMPORARILY_UNAVAILABLE',
        code: 'WHATSAPP_UNAVAILABLE',
        detail: 'WhatsApp Cloud API could not be reached.',
      };
    }
  }
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
