import { createRemoteJWKSet, jwtVerify } from 'jose';

export const roles = [
  'PLATFORM_OWNER',
  'AGENT_ADMIN',
  'KNOWLEDGE_EDITOR',
  'KNOWLEDGE_APPROVER',
  'QA_REVIEWER',
  'OPERATIONS_MANAGER',
  'CUSTOMER_SERVICE_OPERATOR',
  'ANALYST_EXECUTIVE',
  'PRIVACY_SECURITY_AUDITOR',
  'RESTRICTED_VENDOR_ADMIN',
] as const;
export type Role = (typeof roles)[number];
export type Purpose =
  | 'OPERATIONS'
  | 'QUALITY_REVIEW'
  | 'CUSTOMER_SUPPORT'
  | 'ANALYTICS'
  | 'PRIVACY_AUDIT'
  | 'RELEASE_MANAGEMENT';
export interface Principal {
  subject: string;
  roles: Role[];
  purposes: Purpose[];
  sensitiveClearance: boolean;
}

const permissionMatrix: Record<string, Role[]> = {
  'provider:manage': ['PLATFORM_OWNER'],
  'administration.integrations.manage': ['PLATFORM_OWNER', 'RESTRICTED_VENDOR_ADMIN'],
  'agent:write': ['AGENT_ADMIN'],
  'agent:publish': ['PLATFORM_OWNER'],
  'knowledge:write': ['KNOWLEDGE_EDITOR'],
  'knowledge:approve': ['KNOWLEDGE_APPROVER'],
  'test:write': ['QA_REVIEWER', 'AGENT_ADMIN'],
  'calls:read': [
    'QA_REVIEWER',
    'OPERATIONS_MANAGER',
    'CUSTOMER_SERVICE_OPERATOR',
    'PRIVACY_SECURITY_AUDITOR',
  ],
  'corrections:write': ['QA_REVIEWER', 'PRIVACY_SECURITY_AUDITOR'],
  'reports:read': ['ANALYST_EXECUTIVE', 'OPERATIONS_MANAGER', 'PRIVACY_SECURITY_AUDITOR'],
  'audit:read': ['PRIVACY_SECURITY_AUDITOR'],
  'retention:manage': ['PRIVACY_SECURITY_AUDITOR'],
};

export function authorize(
  principal: Principal,
  permission: keyof typeof permissionMatrix,
  purpose?: Purpose,
): boolean {
  const permittedRoles = permissionMatrix[permission] ?? [];
  return (
    principal.roles.some((role) => permittedRoles.includes(role)) &&
    (!purpose || principal.purposes.includes(purpose))
  );
}

export function maskPhone(value: string, unmasked: boolean): string {
  if (unmasked) return value;
  const suffix = value.replace(/\D/g, '').slice(-3);
  return `•••••••${suffix}`;
}

export function maskEmail(value: string, unmasked: boolean): string {
  if (unmasked) return value;
  const [local = '', domain = ''] = value.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function createOidcVerifier(issuer: string, audience: string) {
  const normalizedIssuer = issuer.replace(/\/$/, '');
  const jwksUrl = normalizedIssuer.includes('/realms/')
    ? `${normalizedIssuer}/protocol/openid-connect/certs`
    : `${normalizedIssuer}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (token: string): Promise<Principal> => {
    const { payload } = await jwtVerify(token, jwks, { issuer: normalizedIssuer });
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audiences.includes(audience) && payload.client_id !== audience)
      throw new Error('OIDC token audience is not approved');
    const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
    const cognitoGroups = payload['cognito:groups'] as string[] | undefined;
    const assigned = [...(realmAccess?.roles ?? []), ...(cognitoGroups ?? [])].filter(
      (role): role is Role => roles.includes(role as Role),
    );
    return {
      subject: payload.sub ?? '',
      roles: assigned,
      purposes: (payload.purposes as Purpose[] | undefined) ?? [],
      sensitiveClearance: payload.sensitive_clearance === true,
    };
  };
}
