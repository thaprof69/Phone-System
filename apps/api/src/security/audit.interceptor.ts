import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { Principal } from '@quantum-parks/auth';
import { AuditService } from '../services/audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      id?: string;
      headers: Record<string, string | string[] | undefined>;
      principal?: Principal;
    }>();
    if (
      ['/health', '/ready', '/metrics'].includes(request.url) ||
      request.url.startsWith('/docs')
    ) {
      return next.handle();
    }
    return next.handle().pipe(
      mergeMap(async (value: unknown) => {
        const principal = request.principal;
        const publicProviderRoute =
          request.url.startsWith('/v1/webhooks/elevenlabs/') ||
          request.url.startsWith('/v1/elevenlabs/');
        const purposeHeader = request.headers['x-qp-purpose'];
        const declaredPurpose = Array.isArray(purposeHeader) ? purposeHeader[0] : purposeHeader;
        await this.audit.append({
          actorType: principal ? 'USER' : publicProviderRoute ? 'PROVIDER' : 'SYSTEM',
          ...(principal?.subject ? { actorId: principal.subject } : {}),
          action: `${request.method} ${request.url.split('?')[0]}`,
          aggregateType: 'HTTP_ROUTE',
          aggregateId: request.url.split('?')[0] ?? request.url,
          purpose: declaredPurpose ?? principal?.purposes[0] ?? 'SYSTEM_OPERATION',
          ...(request.id ? { requestId: request.id } : {}),
        });
        return value;
      }),
    );
  }
}
