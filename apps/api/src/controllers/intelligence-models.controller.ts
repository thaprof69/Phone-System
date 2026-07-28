import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import {
  INTELLIGENCE_CAPABILITIES,
  INTELLIGENCE_PROVIDERS,
  IntelligenceRoutingService,
  RoutingError,
  type IntelligenceCapability,
  type IntelligenceProviderKey,
} from '../services/intelligence-routing.service.js';
import { KNOWLEDGE_FIELD_LABELS } from '../services/knowledge-copilot.js';

/**
 * Every provider name, submodel and capability is re-validated here. Nothing the
 * browser sends is trusted: an unknown provider or capability is rejected before it
 * reaches the routing service, and the raw API key is accepted but never echoed back.
 */
const ProviderSchema = z.enum(
  INTELLIGENCE_PROVIDERS as unknown as [IntelligenceProviderKey, ...IntelligenceProviderKey[]],
);
const CapabilitySchema = z.enum(
  INTELLIGENCE_CAPABILITIES as unknown as [IntelligenceCapability, ...IntelligenceCapability[]],
);
/** Provider model ids are conservative slugs — never free text. */
const SubmodelSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:\-\/]+$/, 'That is not a valid model identifier.');
const ApiKeySchema = z.string().min(8).max(512);
const ModelIdSchema = z.string().uuid();

const CreateModelSchema = z
  .object({
    provider: ProviderSchema,
    submodel: SubmodelSchema,
    apiKey: ApiKeySchema,
  })
  .strict();

const UpdateModelSchema = z
  .object({
    submodel: SubmodelSchema.optional(),
    /** Blank/absent means "keep the stored secret". */
    apiKey: ApiKeySchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes were supplied.');

/**
 * Submodel discovery is a POST, not a GET: an unsaved API key may be supplied to list
 * a provider's live models, and a query string would put that key in access logs.
 */
const SubmodelQuerySchema = z
  .object({
    provider: ProviderSchema,
    apiKey: ApiKeySchema.optional(),
    modelId: ModelIdSchema.optional(),
  })
  .strict();

const SaveRouteSchema = z
  .object({
    primaryModelId: ModelIdSchema.nullable(),
    fallbackModelId: ModelIdSchema.nullable(),
  })
  .strict();

const EnhanceKnowledgeFieldSchema = z
  .object({
    fieldLabel: z.enum(KNOWLEDGE_FIELD_LABELS),
    currentText: z.string().trim().min(3).max(6_000),
    context: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            value: z.string().trim().min(1).max(2_000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const AnalyseKnowledgeDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    kind: z.enum(['PDF', 'Word', 'Sheets', 'Markdown', 'Text']),
    sourceText: z.string().trim().min(20).max(80_000),
  })
  .strict();

type AuthenticatedRequest = { principal: Principal };

function toHttp(error: unknown): never {
  if (error instanceof RoutingError)
    throw new HttpException({ message: error.message, code: error.code }, HttpStatus.BAD_REQUEST);
  throw error;
}

@Controller('admin/ai/intelligence')
@RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
export class IntelligenceModelsController {
  constructor(private readonly routing: IntelligenceRoutingService) {}

  // ---------------------------------------------------------------- models

  @Get('models')
  listModels() {
    return this.routing.listModels();
  }

  @Post('submodels')
  async listSubmodels(@Body() body: unknown) {
    const parsed = SubmodelQuerySchema.parse(body);
    return this.routing.listSubmodels(parsed.provider, parsed.apiKey, parsed.modelId);
  }

  @Post('models')
  async createModel(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = CreateModelSchema.parse(body);
    try {
      return await this.routing.createModel(request.principal, parsed);
    } catch (error) {
      return toHttp(error);
    }
  }

  @Patch('models/:id')
  async updateModel(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateModelSchema.parse(body);
    try {
      return await this.routing.updateModel(request.principal, ModelIdSchema.parse(id), parsed);
    } catch (error) {
      return toHttp(error);
    }
  }

  @Delete('models/:id')
  async removeModel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    try {
      return await this.routing.removeModel(request.principal, ModelIdSchema.parse(id));
    } catch (error) {
      return toHttp(error);
    }
  }

  @Post('models/:id/test')
  async testModel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    try {
      return await this.routing.testModel(request.principal, ModelIdSchema.parse(id));
    } catch (error) {
      return toHttp(error);
    }
  }

  // ---------------------------------------------------------------- routes

  @Get('routes')
  listRoutes() {
    return this.routing.listRoutes();
  }

  @Put('routes/:capability')
  async saveRoute(
    @Req() request: AuthenticatedRequest,
    @Param('capability') capability: string,
    @Body() body: unknown,
  ) {
    const parsed = SaveRouteSchema.parse(body);
    try {
      return await this.routing.saveRoute(
        request.principal,
        CapabilitySchema.parse(capability),
        parsed,
      );
    } catch (error) {
      return toHttp(error);
    }
  }

  @Post('routes/:capability/test')
  async testRoute(@Param('capability') capability: string) {
    try {
      return await this.routing.testRoute(CapabilitySchema.parse(capability));
    } catch (error) {
      return toHttp(error);
    }
  }

  @Get('executions')
  recentExecutions(@Query('capability') capability?: string) {
    return this.routing.recentExecutions(
      capability ? CapabilitySchema.parse(capability) : undefined,
    );
  }

  @Post('copilot/enhance')
  async enhanceKnowledgeField(@Body() body: unknown) {
    const result = await this.routing.enhanceKnowledgeField(
      EnhanceKnowledgeFieldSchema.parse(body),
    );
    if (!result.ok)
      throw new HttpException(
        { message: result.message, code: result.category },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return result;
  }

  @Post('knowledge/analyse')
  async analyseKnowledgeDocument(@Body() body: unknown) {
    const result = await this.routing.analyseKnowledgeDocument(
      AnalyseKnowledgeDocumentSchema.parse(body),
    );
    if (!result.ok)
      throw new HttpException(
        { message: result.message, code: result.category },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return result;
  }
}
