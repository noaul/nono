import { describe, expect, it } from 'vitest';
import { classifyAuditMutation } from '../src/plugins/audit.js';

describe('product audit classification', () => {
  it('does not misclassify other product routes', () => {
    expect(classifyAuditMutation('POST', '/api/nostar/sync')!.resourceType).toBe('nostar');
    expect(classifyAuditMutation('POST', '/api/nodesk/articles')!.resourceType).toBe('nodesk');
  });
});
