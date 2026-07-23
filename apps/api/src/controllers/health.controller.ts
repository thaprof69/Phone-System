import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { conversations, rawWebhookEvents, webhookInboxEntries } from '@quantum-parks/db';
import { Registry, Gauge } from 'prom-client';
import { DatabaseService } from '../services/database.service.js';
import { PlatformService } from '../services/platform.service.js';

@Controller()
export class HealthController {
  private readonly registry = new Registry();
  private readonly pendingInbox = new Gauge({
    name: 'qp_webhook_inbox_pending',
    help: 'Pending durable webhook inbox items',
    registers: [this.registry],
  });
  private readonly partialCalls = new Gauge({
    name: 'qp_conversations_partial',
    help: 'Canonical conversations with partial enrichment',
    registers: [this.registry],
  });
  private readonly lastWebhookAge = new Gauge({
    name: 'qp_last_webhook_age_seconds',
    help: 'Seconds since the latest raw webhook event',
    registers: [this.registry],
  });

  constructor(
    private readonly database: DatabaseService,
    private readonly platform: PlatformService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'quantum-parks-api', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      const readiness = await this.platform.readiness();
      return {
        status: readiness.allowed ? 'ready' : 'degraded',
        readiness: readiness.state,
        blockers: readiness.blockers,
      };
    } catch {
      return {
        status: 'unavailable',
        readiness: 'EXTERNALLY_BLOCKED',
        blockers: ['Authoritative database or provider health could not be evaluated'],
      };
    }
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(@Headers('x-metrics-token') token?: string) {
    if (token !== (process.env.METRICS_TOKEN ?? 'synthetic-metrics-token'))
      throw new UnauthorizedException('Metrics authentication failed');
    const [pending, partial, latest] = await Promise.all([
      this.database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookInboxEntries)
        .where(eq(webhookInboxEntries.state, 'PENDING')),
      this.database.db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(eq(conversations.processingState, 'PARTIAL')),
      this.database.db
        .select({ receivedAt: rawWebhookEvents.receivedAt })
        .from(rawWebhookEvents)
        .orderBy(desc(rawWebhookEvents.receivedAt))
        .limit(1),
    ]);
    this.pendingInbox.set(pending[0]?.count ?? 0);
    this.partialCalls.set(partial[0]?.count ?? 0);
    this.lastWebhookAge.set(
      latest[0] ? Math.max(0, (Date.now() - latest[0].receivedAt.getTime()) / 1_000) : 0,
    );
    return this.registry.metrics();
  }
}
