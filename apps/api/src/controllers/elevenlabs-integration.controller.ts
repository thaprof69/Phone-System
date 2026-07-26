import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import { ElevenLabsIntegrationService } from '../services/elevenlabs-integration.service.js';

const EnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);
const SafeProviderIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const TestSchema = z
  .object({
    apiKey: z.string().min(8).max(512),
    connectionLabel: z.string().trim().min(2).max(100),
    environment: EnvironmentSchema,
    defaultAgentId: SafeProviderIdSchema.optional(),
  })
  .strict();
const RuntimeConfigFields = {
  receptionistDisplayName: z.string().trim().min(1).max(100).nullable().optional(),
  greetingOverride: z.string().trim().min(1).max(500).nullable().optional(),
  language: z.string().trim().min(2).max(20).nullable().optional(),
  voiceTestingEnabled: z.boolean().optional(),
  chatTestingEnabled: z.boolean().optional(),
  transcriptCapture: z.boolean().optional(),
  summaryGeneration: z.boolean().optional(),
  escalationDetection: z.boolean().optional(),
  voiceMode: z.enum(['WEBRTC_PREFERRED', 'WEBSOCKET_ONLY']).optional(),
};
const DiagnosticsRunIdSchema = z.string().uuid();
const ConnectSchema = TestSchema.extend({
  validationProof: z.string().min(20).max(2_000),
  defaultVoiceId: SafeProviderIdSchema.optional(),
  ...RuntimeConfigFields,
}).strict();
const UpdateSchema = z
  .object({
    connectionLabel: z.string().trim().min(2).max(100).optional(),
    defaultAgentId: SafeProviderIdSchema.nullable().optional(),
    defaultVoiceId: SafeProviderIdSchema.nullable().optional(),
    ...RuntimeConfigFields,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const RotateSchema = TestSchema.extend({
  validationProof: z.string().min(20).max(2_000),
}).strict();

type AuthenticatedRequest = { principal: Principal };

@Controller('admin/integrations/elevenlabs')
@RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
export class ElevenLabsIntegrationController {
  constructor(private readonly integration: ElevenLabsIntegrationService) {}

  @Get('status')
  status() {
    return this.integration.status();
  }

  @Get('capabilities')
  capabilities() {
    return this.integration.capabilities();
  }

  @Get('readiness-summary')
  readinessSummary() {
    return this.integration.readinessSummary();
  }

  @Get('media-verification-summary')
  mediaVerificationSummary() {
    return this.integration.mediaVerificationSummary();
  }

  @Post('diagnostics')
  runDiagnostics(@Req() request: AuthenticatedRequest) {
    return this.integration.runDiagnostics(request.principal);
  }

  @Get('diagnostics')
  diagnosticsHistory() {
    return this.integration.getDiagnosticsHistory();
  }

  @Get('diagnostics/:id')
  diagnosticsRun(@Param('id') id: string) {
    return this.integration.getDiagnosticsRun(DiagnosticsRunIdSchema.parse(id));
  }

  @Post('test')
  test(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.integration.testConnection(TestSchema.parse(body), request.principal);
  }

  @Post('connect')
  connect(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.integration.connect(ConnectSchema.parse(body), request.principal);
  }

  @Post('verify')
  verify(@Req() request: AuthenticatedRequest) {
    return this.integration.verifySaved(request.principal);
  }

  @Post('rotate')
  rotate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.integration.rotate(RotateSchema.parse(body), request.principal);
  }

  @Patch()
  update(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.integration.update(UpdateSchema.parse(body), request.principal);
  }

  @Delete()
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.integration.disconnect(request.principal);
  }
}
