import { Controller, Get, Post } from '@nestjs/common';
import { PlatformService } from '../services/platform.service.js';
import { RequirePermission } from '../security/access.guard.js';

@Controller('provider-connections')
export class ProviderController {
  constructor(private readonly platform: PlatformService) {}
  @RequirePermission('provider:manage')
  @Get('health')
  health() {
    return this.platform.providerHealth();
  }
  @RequirePermission('provider:manage')
  @Get('capabilities')
  capabilities() {
    return this.platform.providerCapabilities();
  }
  @RequirePermission('provider:manage')
  @Post('reconcile')
  reconcile() {
    return this.platform.requestReconciliation();
  }
}
