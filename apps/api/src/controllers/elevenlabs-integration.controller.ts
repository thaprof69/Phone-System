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
const TransferTypeSchema = z.enum(['provider_default', 'conference', 'blind', 'sip_refer']);
const TransferDestinationSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    label: z.string().trim().min(1).max(120),
    type: z.enum(['alias', 'phone', 'sip_uri']),
    value: z.string().trim().min(1).max(240),
    availability: z.string().trim().min(1).max(240),
    priority: z.number().int().min(1).max(99),
    notes: z.string().trim().max(1_000),
  })
  .strict();
const TransferRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    label: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    priority: z.number().int().min(1).max(99),
    destinationId: z.string().trim().min(1).max(80),
    transferType: TransferTypeSchema,
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_-]+$/),
    condition: z.string().trim().min(10).max(2_000),
    clientMessage: z.string().trim().min(1).max(500),
    operatorMessage: z.string().trim().min(1).max(1_000),
  })
  .strict();
const TransferConfigurationSchema = z
  .object({
    enabled: z.boolean(),
    executionOwner: z.literal('ELEVENLABS'),
    transferTool: z.literal('transfer_to_number'),
    defaultTransferType: TransferTypeSchema,
    warmHandoffPreferred: z.boolean(),
    preserveCallerIdPreferred: z.boolean(),
    passConversationContext: z.boolean(),
    destinations: z.array(TransferDestinationSchema).min(1).max(12),
    rules: z.array(TransferRuleSchema).min(1).max(20),
    fallback: z
      .object({
        type: z.enum(['callback', 'voicemail', 'message_only']),
        destinationId: z.string().trim().min(1).max(80).nullable(),
        instructions: z.string().trim().min(1).max(1_000),
      })
      .strict(),
    copilotContext: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const destinationIds = new Set(value.destinations.map((destination) => destination.id));
    for (const rule of value.rules) {
      if (!destinationIds.has(rule.destinationId)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', rule.id, 'destinationId'],
          message: 'Rule destination must reference an approved destination.',
        });
      }
    }
    if (value.fallback.destinationId && !destinationIds.has(value.fallback.destinationId)) {
      context.addIssue({
        code: 'custom',
        path: ['fallback', 'destinationId'],
        message: 'Fallback destination must reference an approved destination.',
      });
    }
  });
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
  transferConfiguration: TransferConfigurationSchema.optional(),
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

  @Post('synchronize-active-agent')
  synchronizeActiveAgent(@Req() request: AuthenticatedRequest) {
    return this.integration.synchronizeActiveAgentFromStoredCredential(request.principal);
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
