import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { desc, sql } from 'drizzle-orm';
import { auditEvents } from '@quantum-parks/db';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async append(input: {
    actorType: 'USER' | 'PROVIDER' | 'SYSTEM';
    actorId?: string;
    action: string;
    aggregateType: string;
    aggregateId: string;
    purpose: string;
    requestId?: string;
    result?: string;
    payload?: Record<string, unknown>;
  }) {
    const occurredAt = new Date();
    const eventId = randomUUID();
    await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('quantum-parks-audit-chain'))`);
      const [previous] = await tx
        .select({ eventHash: auditEvents.eventHash })
        .from(auditEvents)
        .orderBy(desc(auditEvents.sequence))
        .limit(1);
      const payload = {
        requestId: input.requestId ?? null,
        result: input.result ?? 'SUCCESS',
        ...(input.payload ?? {}),
      };
      const eventHash = createHash('sha256')
        .update(
          JSON.stringify({
            eventId,
            occurredAt: occurredAt.toISOString(),
            actorType: input.actorType,
            actorId: input.actorId ?? null,
            action: input.action,
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            purpose: input.purpose,
            payload,
            previousHash: previous?.eventHash ?? null,
          }),
        )
        .digest('hex');
      await tx.insert(auditEvents).values({
        eventId,
        occurredAt,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        purpose: input.purpose,
        classification: 'INTERNAL',
        payload,
        previousHash: previous?.eventHash ?? null,
        eventHash,
      });
    });
  }
}
