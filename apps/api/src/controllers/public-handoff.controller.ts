import { createHash } from 'node:crypto';
import { Body, ConflictException, Controller, GoneException, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  customerRegistrationRequests,
  digitalLinks,
  privacyConsentAcceptances,
} from '@quantum-parks/db';
import { DatabaseService } from '../services/database.service.js';

const RegistrationSchema = z
  .object({
    token: z.string().min(20).max(512),
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.email().max(254),
    phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
    park: z.enum(['lisboa', 'porto', 'sintra']),
    whatsapp: z.string().optional(),
    sms: z.string().optional(),
    emailUpdates: z.string().optional(),
    privacyConsent: z.literal('accepted'),
  })
  .strict();

@Controller('public/handoffs')
export class PublicHandoffController {
  constructor(private readonly database: DatabaseService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const input = RegistrationSchema.parse(body);
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const link = await this.database.db.query.digitalLinks.findFirst({
      where: eq(digitalLinks.tokenHash, tokenHash),
    });
    if (!link || link.expiresAt <= new Date())
      throw new GoneException('This private link is invalid or has expired.');
    if (link.conversionAt) throw new ConflictException('This private link has already been used.');

    try {
      const registrationId = await this.database.db.transaction(async (tx) => {
        const [registration] = await tx
          .insert(customerRegistrationRequests)
          .values({
            digitalLinkId: link.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email.toLowerCase(),
            phone: input.phone,
            park: input.park,
            communicationPreferences: {
              whatsapp: input.whatsapp === 'true',
              sms: input.sms === 'true',
              email: input.emailUpdates === 'true',
            },
            state: 'REQUESTED',
          })
          .returning({ id: customerRegistrationRequests.id });
        if (!registration) throw new Error('Registration was not persisted');
        await tx.insert(privacyConsentAcceptances).values({
          registrationRequestId: registration.id,
          policyVersion: process.env.PRIVACY_NOTICE_VERSION ?? 'UNAPPROVED-DEVELOPMENT',
          purpose: 'CUSTOMER_REGISTRATION_REQUEST',
          evidence: { source: 'customer-web', explicit: true },
        });
        await tx
          .update(digitalLinks)
          .set({ conversionAt: new Date() })
          .where(eq(digitalLinks.id, link.id));
        return registration.id;
      });
      return {
        status: 'REQUESTED',
        registrationId,
        message: 'Your registration request was recorded.',
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ConflictException('This private link has already been completed.');
    }
  }
}
