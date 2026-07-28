import { Injectable } from '@nestjs/common';
import { GmailAlertAdapter, WhatsAppCloudAlertAdapter } from '@quantum-parks/integrations';
import { IntelligenceRoutingService } from './intelligence-routing.service.js';

export type AlertDraftInput = {
  title: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium';
  affectedRecords: number;
  sourceHref: string;
  channel: 'EMAIL' | 'WHATSAPP';
};

const ALERT_DRAFT_SYSTEM = `You draft concise operational alerts for authorised staff.
Use only the supplied trusted event facts. Never invent a completed action, customer fact,
booking state, recipient, deadline, or source. State what needs attention, impact, affected
record count, and the operator's next action. Return plain text only.`;

@Injectable()
export class CommunicationsService {
  private readonly gmail = new GmailAlertAdapter({
    ...(process.env.GMAIL_ACCESS_TOKEN ? { accessToken: process.env.GMAIL_ACCESS_TOKEN } : {}),
    ...(process.env.GMAIL_ALERT_SENDER ? { sender: process.env.GMAIL_ALERT_SENDER } : {}),
    ...(process.env.GMAIL_USER_ID ? { userId: process.env.GMAIL_USER_ID } : {}),
  });

  private readonly whatsapp = new WhatsAppCloudAlertAdapter({
    ...(process.env.WHATSAPP_ACCESS_TOKEN
      ? { accessToken: process.env.WHATSAPP_ACCESS_TOKEN }
      : {}),
    ...(process.env.WHATSAPP_PHONE_NUMBER_ID
      ? { phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID }
      : {}),
    ...(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
      ? { businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID }
      : {}),
    ...(process.env.WHATSAPP_GRAPH_VERSION
      ? { graphVersion: process.env.WHATSAPP_GRAPH_VERSION }
      : {}),
  });

  constructor(private readonly intelligenceRouting: IntelligenceRoutingService) {}

  readiness() {
    return {
      generatedAt: new Date().toISOString(),
      gmail: this.gmail.readiness(),
      whatsapp: this.whatsapp.readiness(),
      inboundFoundation: {
        gmail: {
          status: 'PLANNED' as const,
          boundary: 'Gmail watch + Cloud Pub/Sub + history synchronisation',
        },
        whatsapp: {
          status: 'PLANNED' as const,
          boundary: 'Signed Meta webhook ingestion with replay-safe event storage',
        },
        zendesk: {
          status: 'ADAPTER_NOT_INSTALLED' as const,
          boundary: 'Ticket events will enter the same governed message inbox',
        },
      },
      policy: {
        defaultMode: 'HUMAN_APPROVAL_REQUIRED' as const,
        automaticRepliesEnabled: false,
        bookingWritesEnabled: false,
        approvedWhatsAppTemplatesRequired: true,
      },
    };
  }

  async draftAlert(input: AlertDraftInput) {
    const outcome = await this.intelligenceRouting.executeCapability('EMAIL_AND_ALERTS', {
      system: ALERT_DRAFT_SYSTEM,
      prompt: JSON.stringify({
        trustedEvent: input,
        instruction:
          input.channel === 'EMAIL'
            ? 'Draft an email subject on the first line, then a short operational email.'
            : 'Draft a compact WhatsApp alert suitable for an approved utility template.',
      }),
      maxOutputTokens: 500,
      temperature: 0.1,
    });
    if (!outcome.ok)
      return {
        status: 'BLOCKED' as const,
        code: outcome.error.category,
        detail: outcome.error.message,
      };
    return {
      status: 'DRAFTED' as const,
      text: outcome.text,
      executionId: outcome.executionId,
      usedFallback: outcome.usedFallback,
      requiresHumanApproval: true,
    };
  }
}
