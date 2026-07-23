import { Body, Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ToolRegistryService } from '../services/tool-registry.service.js';

@Controller('elevenlabs/tools')
export class ToolsController {
  constructor(private readonly registry: ToolRegistryService) {}
  @Post(':toolKey') async invoke(
    @Param('toolKey') toolKey: string,
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!this.registry.authenticate(authorization))
      throw new UnauthorizedException('Tool authentication failed');
    return this.registry.invoke(toolKey, body, idempotencyKey);
  }
}
