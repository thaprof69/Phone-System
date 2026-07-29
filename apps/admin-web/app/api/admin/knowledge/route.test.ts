import { describe, expect, it } from 'vitest';
import { resolve } from './[[...action]]/route';

describe('knowledge operation allowlist', () => {
  it('routes draft creation, saving, and submission', () => {
    const id = '12345678-1234-1234-1234-123456789abc';

    expect(resolve('create')).toBe('/knowledge');
    expect(resolve(`versions/${id}/save`)).toBe(`/knowledge-versions/${id}/save`);
    expect(resolve(`versions/${id}/submit`)).toBe(`/knowledge-versions/${id}/submit`);
  });

  it('rejects operations outside the explicit allowlist', () => {
    expect(resolve('publish-everything')).toBeNull();
  });
});
