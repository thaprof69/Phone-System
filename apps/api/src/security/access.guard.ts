import { Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { CanActivate, CustomDecorator, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authorize, createOidcVerifier, type Principal, type Purpose } from '@quantum-parks/auth';

const PERMISSION_KEY = 'qp:permission';
type Permission = Parameters<typeof authorize>[1];
export const RequirePermission = (permission: Permission, purpose?: Purpose): CustomDecorator =>
  SetMetadata(PERMISSION_KEY, { permission, purpose });

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly verify =
    process.env.OIDC_ISSUER && process.env.OIDC_AUDIENCE
      ? createOidcVerifier(process.env.OIDC_ISSUER, process.env.OIDC_AUDIENCE)
      : undefined;

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      url: string;
      headers: Record<string, string | string[] | undefined>;
      principal?: Principal;
    }>();
    const publicPath =
      request.url === '/health' ||
      request.url === '/ready' ||
      request.url === '/metrics' ||
      request.url.startsWith('/v1/webhooks/elevenlabs/') ||
      request.url.startsWith('/v1/elevenlabs/tools/') ||
      request.url.startsWith('/v1/elevenlabs/personalization/') ||
      request.url.startsWith('/v1/public/');
    if (publicPath) return true;

    let principal: Principal;
    if ((process.env.QP_ENVIRONMENT ?? 'development') !== 'production') {
      principal = {
        subject: 'development-identity',
        roles: [
          'PLATFORM_OWNER',
          'AGENT_ADMIN',
          'KNOWLEDGE_EDITOR',
          'KNOWLEDGE_APPROVER',
          'QA_REVIEWER',
          'OPERATIONS_MANAGER',
          'PRIVACY_SECURITY_AUDITOR',
        ],
        purposes: [
          'OPERATIONS',
          'QUALITY_REVIEW',
          'ANALYTICS',
          'PRIVACY_AUDIT',
          'RELEASE_MANAGEMENT',
        ],
        sensitiveClearance: true,
      };
    } else {
      const header = request.headers.authorization ?? request.headers['x-amzn-oidc-accesstoken'];
      const value = Array.isArray(header) ? header[0] : header;
      const token = value?.startsWith('Bearer ') ? value.slice(7) : value;
      if (!token || !this.verify)
        throw new UnauthorizedException('OIDC bearer authentication is required');
      try {
        principal = await this.verify(token);
      } catch {
        throw new UnauthorizedException('OIDC bearer token is invalid');
      }
    }
    request.principal = principal;
    const requirement = this.reflector.getAllAndOverride<{
      permission: Permission;
      purpose?: Purpose;
    }>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (requirement && !authorize(principal, requirement.permission, requirement.purpose))
      throw new ForbiddenException('The role or declared purpose does not permit this operation');
    return true;
  }
}
