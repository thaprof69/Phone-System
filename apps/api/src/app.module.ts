import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './controllers/health.controller.js';
import { ProviderController } from './controllers/provider.controller.js';
import { WebhookController } from './controllers/webhook.controller.js';
import { ToolsController } from './controllers/tools.controller.js';
import { PersonalizationController } from './controllers/personalization.controller.js';
import { ControlPlaneController } from './controllers/control-plane.controller.js';
import { PublicHandoffController } from './controllers/public-handoff.controller.js';
import { PlatformService } from './services/platform.service.js';
import { WebhookIngestionService } from './services/webhook-ingestion.service.js';
import { ToolRegistryService } from './services/tool-registry.service.js';
import { DatabaseService } from './services/database.service.js';
import { WorkflowDispatchService } from './services/workflow-dispatch.service.js';
import { AccessGuard } from './security/access.guard.js';
import { AuditInterceptor } from './security/audit.interceptor.js';
import { AuditService } from './services/audit.service.js';
import { ElevenLabsIntegrationController } from './controllers/elevenlabs-integration.controller.js';
import { ElevenLabsIntegrationService } from './services/elevenlabs-integration.service.js';
import { ProviderCredentialVaultService } from './services/provider-credential-vault.service.js';
import { AiosAdminController } from './controllers/aios-admin.controller.js';
import { AiosInternalController } from './controllers/aios-internal.controller.js';
import { AiosPlatformService } from './services/aios-platform.service.js';
import { ReceptionistPolicyService } from './services/receptionist-policy.service.js';
import { ReceptionistRoutingService } from './services/receptionist-routing.service.js';
import { QuantumResultService } from './services/quantum-result.service.js';
import { ReceptionistSessionService } from './services/receptionist-session.service.js';

@Module({
  controllers: [
    HealthController,
    ProviderController,
    WebhookController,
    ToolsController,
    PersonalizationController,
    ControlPlaneController,
    PublicHandoffController,
    ElevenLabsIntegrationController,
    AiosAdminController,
    AiosInternalController,
  ],
  providers: [
    PlatformService,
    WebhookIngestionService,
    ToolRegistryService,
    DatabaseService,
    WorkflowDispatchService,
    AuditService,
    ElevenLabsIntegrationService,
    ProviderCredentialVaultService,
    AiosPlatformService,
    ReceptionistPolicyService,
    ReceptionistRoutingService,
    QuantumResultService,
    ReceptionistSessionService,
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
