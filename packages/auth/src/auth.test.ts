import { describe, expect, it } from 'vitest';
import { authorize, maskEmail, maskPhone, type Principal } from './index.js';

const reviewer: Principal = {
  subject: 'reviewer-1',
  roles: ['QA_REVIEWER'],
  purposes: ['QUALITY_REVIEW'],
  sensitiveClearance: false,
};

describe('authorization and masking', () => {
  it('requires both an allowed role and the declared purpose', () => {
    expect(authorize(reviewer, 'calls:read', 'QUALITY_REVIEW')).toBe(true);
    expect(authorize(reviewer, 'calls:read', 'PRIVACY_AUDIT')).toBe(false);
    expect(authorize(reviewer, 'agent:publish', 'QUALITY_REVIEW')).toBe(false);
  });

  it('limits provider integration administration to explicitly authorized roles', () => {
    expect(
      authorize(
        {
          ...reviewer,
          roles: ['RESTRICTED_VENDOR_ADMIN'],
          purposes: ['RELEASE_MANAGEMENT'],
        },
        'administration.integrations.manage',
        'RELEASE_MANAGEMENT',
      ),
    ).toBe(true);
    expect(authorize(reviewer, 'administration.integrations.manage', 'QUALITY_REVIEW')).toBe(false);
  });

  it('masks customer identifiers without clearance', () => {
    expect(maskPhone('+351 912 345 678', false)).toBe('•••••••678');
    expect(maskEmail('caller@example.com', false)).toBe('c•••@example.com');
  });
});
