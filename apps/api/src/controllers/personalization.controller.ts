import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { ToolRegistryService } from '../services/tool-registry.service.js';

const PersonalizationSchema = z
  .object({ caller_id: z.string().min(7).max(20), conversation_id: z.string().min(1) })
  .strict();

@Controller('elevenlabs/personalization')
export class PersonalizationController {
  constructor(private readonly tools: ToolRegistryService) {}
  @Post('inbound-call') async personalize(
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    if (!this.tools.authenticate(authorization))
      throw new UnauthorizedException('Personalization authentication failed');
    const input = PersonalizationSchema.parse(body);
    return this.tools.personalize(input.caller_id, input.conversation_id);
  }
}
